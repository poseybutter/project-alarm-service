import {
    PAL_AMBER,
    PAL_BLUE,
    PAL_GREEN,
    PAL_RED,
    PAL_STONE,
    SPR_GEM,
    SPR_HERO,
    SPR_HOURGLASS,
    SPR_KEY,
    SPR_SCROLL,
    SPR_SHIELD,
    type Palette,
} from "./sprites";

type PixProps = {
    map: string[];
    palette: Palette;
    scale?: number;
    className?: string;
    style?: React.CSSProperties;
};

/** 픽셀 SVG 렌더러 — viewBox 1단위 = 1픽셀, shapeRendering crispEdges. */
export function Pix({ map, palette, scale = 4, className, style }: PixProps) {
    const w = map[0].length;
    const h = map.length;
    const cells: React.ReactNode[] = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const ch = map[y][x];
            const c = palette[ch];
            if (c) {
                cells.push(
                    <rect
                        key={`${x}-${y}`}
                        x={x}
                        y={y}
                        width="1"
                        height="1"
                        fill={c}
                    />,
                );
            }
        }
    }
    return (
        <svg
            width={w * scale}
            height={h * scale}
            viewBox={`0 0 ${w} ${h}`}
            shapeRendering="crispEdges"
            style={{ imageRendering: "pixelated", display: "block", ...style }}
            className={className}
        >
            {cells}
        </svg>
    );
}

type SpriteProps = { scale?: number; className?: string };

export function Hero({ scale = 5, className }: SpriteProps) {
    return (
        <Pix
            map={SPR_HERO}
            palette={PAL_AMBER}
            scale={scale}
            className={className}
        />
    );
}

type ToneVariant = "amber" | "stone" | "red" | "green" | "blue";

const TONE_MAP: Record<ToneVariant, Palette> = {
    amber: PAL_AMBER,
    stone: PAL_STONE,
    red: PAL_RED,
    green: PAL_GREEN,
    blue: PAL_BLUE,
};

export function Hourglass({
    scale = 5,
    tone = "amber",
    className,
}: SpriteProps & { tone?: ToneVariant }) {
    return (
        <Pix
            map={SPR_HOURGLASS}
            palette={TONE_MAP[tone]}
            scale={scale}
            className={className}
        />
    );
}

export function PixKey({ scale = 5, className }: SpriteProps) {
    return (
        <Pix
            map={SPR_KEY}
            palette={PAL_AMBER}
            scale={scale}
            className={className}
        />
    );
}

export function Shield({ scale = 5, className }: SpriteProps) {
    return (
        <Pix
            map={SPR_SHIELD}
            palette={PAL_AMBER}
            scale={scale}
            className={className}
        />
    );
}

export function Scroll({ scale = 5, className }: SpriteProps) {
    return (
        <Pix
            map={SPR_SCROLL}
            palette={PAL_AMBER}
            scale={scale}
            className={className}
        />
    );
}

export function Gem({
    scale = 3,
    tone = "blue",
    className,
}: SpriteProps & { tone?: ToneVariant }) {
    return (
        <Pix
            map={SPR_GEM}
            palette={TONE_MAP[tone]}
            scale={scale}
            className={className}
        />
    );
}
