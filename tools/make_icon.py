"""Generate the app icon (1024×1024 PNG) with a Q monogram and an amber node."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

APP = Path(__file__).resolve().parents[1]
OUT = APP / "src-tauri" / "icons" / "app-icon.png"

S = 4  # supersample
W = 1024
INK = (15, 46, 46, 255)
LIGHT = (232, 245, 241, 255)
AMBER = (217, 164, 65, 255)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (W * S, W * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded square background.
    d.rounded_rectangle(
        (0, 0, W * S - 1, W * S - 1),
        radius=220 * S,
        fill=INK,
    )

    # The Q ring.
    ring = (238 * S, 196 * S, 786 * S, 744 * S)
    d.ellipse(ring, outline=LIGHT, width=104 * S)

    # The tail, with a round cap.
    d.line(
        [(640 * S, 600 * S), (786 * S, 746 * S)],
        fill=LIGHT,
        width=104 * S,
        joint="curve",
    )
    d.ellipse(
        (640 * S - 52 * S, 600 * S - 52 * S, 640 * S + 52 * S, 600 * S + 52 * S),
        fill=LIGHT,
    )

    # The amber node at the end of the tail.
    node = (800 * S - 58 * S, 760 * S - 58 * S, 800 * S + 58 * S, 760 * S + 58 * S)
    d.ellipse(node, fill=AMBER)
    d.ellipse(node, outline=INK, width=14 * S)

    img = img.resize((W, W), Image.LANCZOS)
    img.save(OUT)
    print("wrote", OUT, img.size)


if __name__ == "__main__":
    main()
