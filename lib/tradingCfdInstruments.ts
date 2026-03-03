export type Instrument = "EUR/USD";

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
];

export const CFD_INSTRUMENT_NAMES = CFD_INSTRUMENTS.map((entry) => entry.instrument);

export const CFD_STREAM_SYMBOLS = CFD_INSTRUMENTS.map((entry) => entry.streamSymbol);

export const instrumentByName = (instrument: Instrument) =>
  CFD_INSTRUMENTS.find((entry) => entry.instrument === instrument);

export const instrumentByStreamSymbol = (symbol: string) =>
  CFD_INSTRUMENTS.find((entry) => entry.streamSymbol === symbol || entry.symbolCandidates.includes(symbol));
