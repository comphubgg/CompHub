from pathlib import Path
import zlib
import struct


def write_png(path: Path, width: int, height: int, color: tuple[int, int, int, int]):
    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + chunk_type + data + struct.pack('>I', zlib.crc32(chunk_type + data) & 0xffffffff)

    raw = b''
    for _ in range(height):
        raw += b'\x00' + bytes(color) * width
    data = zlib.compress(raw)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', data)
    png += chunk(b'IEND', b'')
    path.write_bytes(png)


def main() -> None:
    root = Path('public/icons')
    root.mkdir(parents=True, exist_ok=True)
    colors = {
        'youtube.png': (255, 0, 0, 255),
        'tiktok.png': (0, 0, 0, 255),
        'instagram.png': (225, 48, 108, 255),
        'discord.png': (88, 101, 242, 255),
    }
    for name, color in colors.items():
        write_png(root / name, 128, 128, color)
        print('written', name)


if __name__ == '__main__':
    main()
