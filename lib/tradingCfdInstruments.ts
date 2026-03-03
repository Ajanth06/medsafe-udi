export type Instrument =
  | "EUR/USD"
  | "NASDAQ 100"
  | "Gold"
  | "WTI Oil"
  | "GBP/USD";

export type InstrumentDefinition = {
  instrument: Instrument;
  streamSymbol: string;
  symbolCandidates: string[];
  maxSpreadNote: string;
  plus500MarketName: string;
  estimatedSpread: number;
  atrStopMultiplier: number;
  atrTakeMultiplier: number;
  minPrice: number;
  maxPrice: number;
};

export const CFD_INSTRUMENTS: InstrumentDefinition[] = [
  {
    instrument: "EUR/USD",
    streamSymbol: "EUR/USD",
    symbolCandidates: ["EUR/USD"],
    maxSpreadNote: "Max 1.2 Pip",
    plus500MarketName: "EUR/USD CFD",
    estimatedSpread: 0.00012,
    atrStopMultiplier: 1.5,
    atrTakeMultiplier: 2,
    minPrice: 0.8,
    maxPrice: 1.5,
  },
  {
    instrument: "NASDAQ 100",
    streamSymbol: "NDX",
    symbolCandidates: ["NDX", "QQQ"],
    maxSpreadNote: "Max 3.0 Punkte",
    plus500MarketName: "Nasdaq 100 CFD",
    estimatedSpread: 3,
    atrStopMultiplier: 1.6,
    atrTakeMultiplier: 2.4,
    minPrice: 10000,
    maxPrice: 30000,
  },
  {
    instrument: "Gold",
    streamSymbol: "XAU/USD",
    symbolCandidates: ["XAU/USD"],
    maxSpreadNote: "Max 0.60 USD",
    plus500MarketName: "Gold CFD",
    estimatedSpread: 0.6,
    atrStopMultiplier: 1.5,
    atrTakeMultiplier: 2.2,
    minPrice: 1500,
    maxPrice: 4000,
  },
  {
    instrument: "WTI Oil",
    streamSymbol: "WTI",
    symbolCandidates: ["WTI", "USOIL"],
    maxSpreadNote: "Max 0.08 USD",
    plus500MarketName: "WTI Oil CFD",
    estimatedSpread: 0.08,
    atrStopMultiplier: 1.6,
    atrTakeMultiplier: 2.4,
    minPrice: 20,
    maxPrice: 120,
  },
  {
    instrument: "GBP/USD",
    streamSymbol: "GBP/USD",
    symbolCandidates: ["GBP/USD"],
    maxSpreadNote: "Max 1.5 Pip",
    plus500MarketName: "GBP/USD CFD",
    estimatedSpread: 0.00015,
    atrStopMultiplier: 1.5,
    atrTakeMultiplier: 2,
    minPrice: 1,
    maxPrice: 1.6,
  },
];

export const CFD_INSTRUMENT_NAMES = CFD_INSTRUMENTS.map((entry) => entry.instrument);

export const CFD_STREAM_SYMBOLS = CFD_INSTRUMENTS.map((entry) => entry.streamSymbol);

export const instrumentByName = (instrument: Instrument) =>
  CFD_INSTRUMENTS.find((entry) => entry.instrument === instrument);

export const instrumentByStreamSymbol = (symbol: string) =>
  CFD_INSTRUMENTS.find((entry) => entry.streamSymbol === symbol || entry.symbolCandidates.includes(symbol));
