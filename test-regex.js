const regex = /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}\s+(.+?)\s*\$\s*([\d\.\,]+)\s*\$\s*([\d\.\,]+)\s*\$\s*([\d\.\,]+)$/;

const lines = [
  "06/07/2026 13:09:50 CARGO CARGO PAC CREDITO HIPOTECARIO BC 71350537082 $ 739.270 $ 0 $ 40.411",
  "18/05/2026 15:27:16 TEF CRISTIAN PIZARRO BANCO SCOTIABANK 76473369682 $ 60.000 $ 0 $ 3.051.648",
  "01/04/2026 00:01:00 CARGO DE INTERESES POR USO LINEA DE CRED 788456773026 $ 1 $ 0 $ 0",
  "06/07/2026 13:09:50 CARGO PAC $20 LIDER 7135 $739.270 $0$ 40.411",
  "20/03/2026 08:34:20 ABONO LIQUIDACIÓN CAPTACIÓN 265682141652 $ 0 $ 25.049.164 $ 25.054.824"
];

lines.forEach(line => {
  const match = line.match(regex);
  if (match) {
    console.log("MATCH:");
    console.log("  Date:", match[1]);
    console.log("  Desc:", match[2]);
    console.log("  Carg:", match[3]);
    console.log("  Abon:", match[4]);
    console.log("  Sald:", match[5]);
  } else {
    console.log("NO MATCH:", line);
  }
});
