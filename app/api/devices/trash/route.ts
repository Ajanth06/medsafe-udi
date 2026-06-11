import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/apiAuth";
import { isValidAdminPin } from "../../../../lib/adminPin";
import { getSupabaseAdmin } from "../../../../lib/supabaseServerClient";
import { isTrashExpired } from "../../../../lib/trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrashAction =
  | "soft_delete"
  | "restore"
  | "permanent_delete"
  | "purge_expired";

function isMissingDeletedAtColumn(message?: string) {
  return /deleted_at|schema cache|could not find/i.test(message || "");
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = (await req.json()) as {
      action?: TrashAction;
      deviceIds?: string[];
      pin?: string;
    };

    const action = body.action;
    const deviceIds = Array.isArray(body.deviceIds)
      ? body.deviceIds.filter((id) => typeof id === "string" && id.trim())
      : [];

    if (!action) {
      return NextResponse.json({ error: "action fehlt." }, { status: 400 });
    }

    const pinRequired =
      action === "soft_delete" || action === "permanent_delete";

    if (pinRequired && !isValidAdminPin(body.pin)) {
      return NextResponse.json(
        { error: "Admin-PIN falsch (nicht dein Login-Passwort)." },
        { status: 403 }
      );
    }

    if (action !== "purge_expired" && deviceIds.length === 0) {
      return NextResponse.json({ error: "Keine Geräte angegeben." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    if (action === "purge_expired") {
      const { data: trashedDevices, error } = await admin
        .from("devices")
        .select("id, deleted_at")
        .not("deleted_at", "is", null);

      if (error) {
        if (isMissingDeletedAtColumn(error.message)) {
          return NextResponse.json({ ok: true, count: 0, mode: "none" });
        }
        throw error;
      }

      const expiredIds =
        trashedDevices
          ?.filter((row) => isTrashExpired(row.deleted_at as string))
          .map((row) => row.id as string) ?? [];

      if (expiredIds.length === 0) {
        return NextResponse.json({ ok: true, count: 0, mode: "none" });
      }

      await admin.from("docs").delete().in("device_id", expiredIds);
      const { data: deleted } = await admin
        .from("devices")
        .delete()
        .in("id", expiredIds)
        .select("id");

      return NextResponse.json({
        ok: true,
        mode: "hard",
        count: deleted?.length ?? 0,
        deviceIds: deleted?.map((row) => row.id) ?? [],
      });
    }

    if (action === "soft_delete") {
      const { data: existingDevices, error: lookupError } = await admin
        .from("devices")
        .select("id")
        .in("id", deviceIds);

      if (lookupError) throw lookupError;

      const existingIds = existingDevices?.map((row) => row.id as string) ?? [];
      if (existingIds.length === 0) {
        return NextResponse.json(
          {
            error:
              "Keine Geräte in der Datenbank gefunden — Seite neu laden und erneut versuchen.",
          },
          { status: 404 }
        );
      }

      const deletedAt = new Date().toISOString();
      const { data: updatedDevices, error: devicesError } = await admin
        .from("devices")
        .update({ deleted_at: deletedAt })
        .in("id", existingIds)
        .select("id");

      if (devicesError && isMissingDeletedAtColumn(devicesError.message)) {
        await admin.from("docs").delete().in("device_id", existingIds);
        const { data: deletedDevices, error: hardError } = await admin
          .from("devices")
          .delete()
          .in("id", existingIds)
          .select("id");
        if (hardError) throw hardError;
        return NextResponse.json({
          ok: true,
          mode: "hard",
          count: deletedDevices?.length ?? 0,
          deletedAt,
        });
      }

      if (devicesError) throw devicesError;

      if (!updatedDevices || updatedDevices.length === 0) {
        return NextResponse.json(
          {
            error:
              "Geräte konnten nicht in den Papierkorb verschoben werden — SUPABASE_SERVICE_ROLE_KEY prüfen (muss service_role sein, nicht anon).",
          },
          { status: 500 }
        );
      }

      await admin
        .from("docs")
        .update({ deleted_at: deletedAt })
        .in("device_id", existingIds);

      return NextResponse.json({
        ok: true,
        mode: "soft",
        count: updatedDevices.length,
        deletedAt,
      });
    }

    if (action === "restore") {
      await admin.from("docs").update({ deleted_at: null }).in("device_id", deviceIds);
      const { data: restoredDevices, error } = await admin
        .from("devices")
        .update({ deleted_at: null })
        .in("id", deviceIds)
        .select("id");
      if (error) throw error;

      return NextResponse.json({
        ok: true,
        mode: "restore",
        count: restoredDevices?.length ?? 0,
      });
    }

    if (action === "permanent_delete") {
      const { data: existingDevices, error: lookupError } = await admin
        .from("devices")
        .select("id")
        .in("id", deviceIds);
      if (lookupError) throw lookupError;

      const existingIds = existingDevices?.map((row) => row.id as string) ?? [];
      if (existingIds.length === 0) {
        return NextResponse.json(
          { error: "Keine Geräte in der Datenbank gefunden." },
          { status: 404 }
        );
      }

      await admin.from("docs").delete().in("device_id", existingIds);
      const { data: deletedDevices, error } = await admin
        .from("devices")
        .delete()
        .in("id", existingIds)
        .select("id");
      if (error) throw error;

      if (!deletedDevices || deletedDevices.length === 0) {
        return NextResponse.json(
          {
            error:
              "Keine Geräte gelöscht — SUPABASE_SERVICE_ROLE_KEY prüfen (service_role, nicht anon).",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        mode: "hard",
        count: deletedDevices.length,
      });
    }

    return NextResponse.json({ error: "Unbekannte action." }, { status: 400 });
  } catch (error) {
    console.error("Device trash API error:", error);
    const message =
      error instanceof Error ? error.message : "Unerwarteter Fehler beim Löschen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
