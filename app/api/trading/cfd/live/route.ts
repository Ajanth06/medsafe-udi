import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TwelveDataMessage = {
  event?: string;
  status?: string;
  symbol?: string;
  price?: number | string;
  bid?: number | string;
  ask?: number | string;
  timestamp?: number | string;
  datetime?: string;
  message?: string;
  code?: number;
};

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request) {
  const apiKey = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "missing_twelvedata_api_key_for_live_stream" },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let socket: WebSocket | null = null;
      let sseKeepAliveId: ReturnType<typeof setInterval> | null = null;

      const sendEvent = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;

        if (sseKeepAliveId) {
          clearInterval(sseKeepAliveId);
        }

        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
          socket.close();
        }

        controller.close();
      };

      sendEvent("status", { state: "connecting", source: "Twelve Data WebSocket" });

      try {
        socket = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`);
      } catch (error) {
        sendEvent("feed-error", {
          message: error instanceof Error ? error.message : "websocket_initialization_failed",
        });
        cleanup();
        return;
      }

      sseKeepAliveId = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }
      }, 15000);

      socket.addEventListener("open", () => {
        if (!socket) return;

        sendEvent("status", { state: "open", source: "Twelve Data WebSocket" });
        socket.send(
          JSON.stringify({
            action: "subscribe",
            params: {
              symbols: "EUR/USD",
            },
          })
        );
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as TwelveDataMessage;

          if (payload.event === "price") {
            sendEvent("tick", {
              symbol: payload.symbol,
              price: normalizeNumber(payload.price),
              bid: normalizeNumber(payload.bid),
              ask: normalizeNumber(payload.ask),
              timestamp: normalizeNumber(payload.timestamp),
              datetime: payload.datetime,
            });
            return;
          }

          if (payload.event === "subscribe-status" || payload.status === "ok") {
            sendEvent("status", {
              state: "subscribed",
              source: "Twelve Data WebSocket",
              symbol: payload.symbol,
            });
            return;
          }

          if (payload.event === "error" || payload.status === "error") {
            sendEvent("feed-error", {
              message: payload.message || "twelvedata_websocket_error",
              code: payload.code,
            });
            return;
          }

          sendEvent("status", {
            state: payload.event || payload.status || "message",
            source: "Twelve Data WebSocket",
          });
        } catch {
          sendEvent("feed-error", { message: "twelvedata_websocket_parse_failed" });
        }
      });

      socket.addEventListener("error", () => {
        sendEvent("feed-error", { message: "twelvedata_websocket_transport_error" });
      });

      socket.addEventListener("close", (event) => {
        sendEvent("status", {
          state: "closed",
          source: "Twelve Data WebSocket",
          reason: event.reason || `socket_closed_${event.code}`,
        });
        cleanup();
      });

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      return;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
