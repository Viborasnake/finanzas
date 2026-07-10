const regex = /^(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2}:\d{2})?\s+(.+?)\s+(?:\$\s*)?([\d\.\,]+)\s+(?:\$\s*)?([\d\.\,]+)\s+(?:\$\s*)?([\d\.\,]+)$/;

const lines = [
  "06/07/2026 13:09:50 CARGO CARGO PAC CREDITO HIPOTECARIO BC 71350537082 $ 739.270 $ 0 $ 40.411", // Normal OCR
  "18/05/2026 TEF CRISTIAN 76473369682 60.000 0 3.051.648", // No time, no $
  "01/04/2026 00:01:00 CARGO DE INTERESES 788456773026 $1 $0 $0", // No spaces after $
  "06/07/2026 13:09:50 CARGO PAC $20 LIDER 7135 739.270 $0 40.411", // mixed $ and missing $
  "20/03/2026 08:34:20 ABONO LIQUIDACIÓN CAPTACIÓN 265682141652 $ 0 $ 25.049.164 $ 25.054.824",
  "06/07/2026 13:09:50 CARGO PAC 7135 $ 739.270$0$40.411" // missing spaces between values
];

lines.forEach(line => {
  const match = line.match(regex);
  if (match) {
    console.log("MATCH:", match[1], "|", match[2], "|", match[3], "|", match[4], "|", match[5]);
  } else {
    console.log("NO MATCH:", line);
  }
});
