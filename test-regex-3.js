const regex = /^(\d{2}[/\-\.]\d{2}[/\-\.]\d{2,4})(?:\s+\d{2}:\d{2}:\d{2})?\s+(.+?)\s*(?:\$\s*)?(-?[\d\.\,]+)\s*(?:\$\s*)?(-?[\d\.\,]+)\s*(?:\$\s*)?(-?[\d\.\,]+)$/;

const lines = [
  "06/07/2026 13:09:50 CARGO CARGO PAC CREDITO HIP $ 300.916 $ 0 $ -234.331",
  "06/07/2026 13:09:50 ABONO $ 0 $ 10.000 $ -234.331",
  "06-07-2026 13:09 CARGO PAC $ 300.916 $ 0 $ -234.331",
  "06-07-2026 CARGO PAC 300.916 0 -234.331",
  "08/04/2024 00:00:00 COMPRA DE INVERSIONES MM $ 249.992 $ 0 $ 8"
];

for (const line of lines) {
  const match = line.match(regex);
  if (match) {
    console.log("MATCH:", match.slice(1));
  } else {
    console.log("NO MATCH:", line);
  }
}
