/** Little-endian binary writer that grows as needed (the net protocol, ADR 0005). */
export class ByteWriter {
  private buffer = new ArrayBuffer(256);
  private view = new DataView(this.buffer);
  length = 0;

  u8(value: number): this {
    this.reserve(1);
    this.view.setUint8(this.length, value);
    this.length += 1;
    return this;
  }

  i8(value: number): this {
    this.reserve(1);
    this.view.setInt8(this.length, clamp(Math.round(value), -128, 127));
    this.length += 1;
    return this;
  }

  u16(value: number): this {
    this.reserve(2);
    this.view.setUint16(this.length, clamp(Math.round(value), 0, 0xffff), true);
    this.length += 2;
    return this;
  }

  i16(value: number): this {
    this.reserve(2);
    this.view.setInt16(this.length, clamp(Math.round(value), -0x8000, 0x7fff), true);
    this.length += 2;
    return this;
  }

  u32(value: number): this {
    this.reserve(4);
    this.view.setUint32(this.length, value >>> 0, true);
    this.length += 4;
    return this;
  }

  f64(value: number): this {
    this.reserve(8);
    this.view.setFloat64(this.length, value, true);
    this.length += 8;
    return this;
  }

  /** A short UTF-8 string: u8 byte length, then the bytes. Throws past 255 bytes. */
  str(value: string): this {
    const utf8 = textEncoder.encode(value);
    if (utf8.length > 0xff) throw new Error(`String too long for the wire: ${value.slice(0, 20)}…`);
    this.u8(utf8.length);
    this.reserve(utf8.length);
    new Uint8Array(this.buffer, this.length, utf8.length).set(utf8);
    this.length += utf8.length;
    return this;
  }

  /** A copy of the bytes written so far. */
  bytes(): Uint8Array {
    return new Uint8Array(this.buffer.slice(0, this.length));
  }

  private reserve(n: number): void {
    if (this.length + n <= this.buffer.byteLength) return;
    const bigger = new ArrayBuffer(Math.max(this.buffer.byteLength * 2, this.length + n));
    new Uint8Array(bigger).set(new Uint8Array(this.buffer));
    this.buffer = bigger;
    this.view = new DataView(bigger);
  }
}

/** Reads what ByteWriter wrote. Throws on truncated packets. */
export class ByteReader {
  private readonly view: DataView;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  i8(): number {
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  i16(): number {
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f64(): number {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  str(): string {
    const length = this.u8();
    if (this.offset + length > this.view.byteLength) throw new RangeError('Truncated string');
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return textDecoder.decode(bytes);
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
