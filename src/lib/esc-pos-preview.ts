export type EscPosPreviewAlignment = "left" | "center" | "right";

export type EscPosPreviewLine = {
  alignment: EscPosPreviewAlignment;
  heightScale: number;
  text: string;
  widthScale: number;
};

export type EscPosPreviewTicket = {
  lines: EscPosPreviewLine[];
};

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export function decodeEscPosPreview(
  content: Buffer,
  physicalCopies = 1,
): EscPosPreviewTicket[] {
  const tickets: EscPosPreviewTicket[] = [];
  let lines: EscPosPreviewLine[] = [];
  let line = "";
  let alignment: EscPosPreviewAlignment = "left";
  let widthScale = 1;
  let heightScale = 1;

  function pushLine() {
    lines.push({ alignment, heightScale, text: line, widthScale });
    line = "";
  }

  function finishTicket() {
    if (line) pushLine();
    if (lines.length) tickets.push({ lines });
    lines = [];
  }

  for (let index = 0; index < content.length;) {
    const byte = content[index];

    if (byte === ESC && content[index + 1] === 0x40) {
      alignment = "left";
      widthScale = 1;
      heightScale = 1;
      index += 2;
      continue;
    }

    if (byte === ESC && content[index + 1] === 0x61) {
      alignment = decodeAlignment(content[index + 2]);
      index += 3;
      continue;
    }

    if (byte === GS && content[index + 1] === 0x21) {
      const size = content[index + 2] ?? 0;
      widthScale = (size & 0x0f) + 1;
      heightScale = ((size >> 4) & 0x0f) + 1;
      index += 3;
      continue;
    }

    if (
      byte === GS &&
      content[index + 1] === 0x56 &&
      content[index + 2] === 0x41
    ) {
      finishTicket();
      index += 4;
      continue;
    }

    if (byte === LF) {
      pushLine();
      index += 1;
      continue;
    }

    if (byte >= 0x20 && byte <= 0x7e) line += String.fromCharCode(byte);
    index += 1;
  }

  finishTicket();

  return Array.from({ length: Math.max(physicalCopies, 1) }, () => tickets)
    .flat()
    .map((ticket) => ({
      lines: ticket.lines.map((ticketLine) => ({ ...ticketLine })),
    }));
}

function decodeAlignment(value: number | undefined): EscPosPreviewAlignment {
  if (value === 1) return "center";
  if (value === 2) return "right";
  return "left";
}
