"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * 인증 화면 배경에 깔리는 픽셀 나뭇잎 파티클.
 * - SSR 시에는 빈 배열 → hydration mismatch 방지
 * - pointer-events-none + absolute inset-0 → 클릭 방해 없음
 * - 부모는 relative + overflow-hidden 권장
 *
 * 동작 메모: framer-motion v12 는 `y` 키프레임에 vh 단위 문자열을 안정적으로
 *   보간하지 못해 잎이 정지하는 현상이 있다. 따라서 window.innerHeight 를
 *   측정해 px 단위 numeric 키프레임으로 넘긴다.
 *   또한 v12 의 transition.delay 는 음수를 지원하지 않으므로 (CSS animation 과 다름),
 *   "이미 떨어지는 중" 효과는 잎별로 fallDuration 안의 양수 startDelay 로 흉내낸다.
 */

const LEAF_COLORS = [
    "#86efac", // green-300
    "#4ade80", // green-400
    "#fbbf24", // amber-400
    "#a3e635", // lime-400
];

// 8×8 픽셀 잎 4종 — '#' = 채움, '.' = 빈칸
const LEAF_SHAPES: ReadonlyArray<ReadonlyArray<string>> = [
    [
        "...##...",
        "..####..",
        ".######.",
        "########",
        "########",
        ".######.",
        "..####..",
        "...##...",
    ],
    [
        "...#....",
        "..###...",
        ".#####..",
        "######..",
        "#####...",
        ".####...",
        "..##....",
        "...#....",
    ],
    [
        "..#..#..",
        ".######.",
        "########",
        "########",
        ".######.",
        "..####..",
        "...##...",
        "....#...",
    ],
    [
        "........",
        "...##...",
        "..####..",
        ".######.",
        ".######.",
        "..####..",
        "...##...",
        "........",
    ],
];

type Leaf = {
    id: number;
    left: number; // %
    shape: number;
    color: string;
    size: number; // px
    fallDuration: number; // s
    startDelay: number; // s (양수)
    swayAmp: number; // px
    swayDuration: number;
    rotateDuration: number;
    rotateDirection: 1 | -1;
    opacity: number;
};

function rand(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

function PixelLeaf({
    shape,
    color,
    size,
}: {
    shape: ReadonlyArray<string>;
    color: string;
    size: number;
}) {
    const cells: ReactNode[] = [];
    for (let y = 0; y < shape.length; y++) {
        const row = shape[y];
        for (let x = 0; x < row.length; x++) {
            if (row[x] === "#") {
                cells.push(
                    <rect
                        key={`${x}-${y}`}
                        x={x}
                        y={y}
                        width="1"
                        height="1"
                        fill={color}
                    />,
                );
            }
        }
    }
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 8 8"
            shapeRendering="crispEdges"
            style={{ imageRendering: "pixelated", display: "block" }}
            aria-hidden
        >
            {cells}
        </svg>
    );
}

export function FallingLeaves({ count = 18 }: { count?: number }) {
    const [leaves, setLeaves] = useState<Leaf[]>([]);
    const [windowH, setWindowH] = useState(0);

    useEffect(() => {
        const update = () => setWindowH(window.innerHeight);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    useEffect(() => {
        const arr: Leaf[] = Array.from({ length: count }, (_, i) => {
            const fallDuration = rand(4, 8);
            return {
                id: i,
                left: rand(0, 100),
                shape: Math.floor(rand(0, LEAF_SHAPES.length)),
                color: LEAF_COLORS[
                    Math.floor(rand(0, LEAF_COLORS.length))
                ],
                size: rand(12, 36), // scale 0.5~1.5 (기본 24 기준)
                fallDuration,
                // 양수 delay 만 사용. 0 ~ fallDuration 안에서 분포 → 첫 사이클 동안 점진적으로 잎이 나타남.
                startDelay: rand(0, fallDuration),
                swayAmp: rand(10, 30),
                swayDuration: rand(2, 4),
                rotateDuration: rand(3, 8),
                rotateDirection: Math.random() > 0.5 ? 1 : -1,
                opacity: rand(0.4, 0.8),
            };
        });
        setLeaves(arr);
    }, [count]);

    // 윈도우 크기 측정 전엔 렌더 보류 — 키프레임 값이 0 이면 모션 정지처럼 보임
    if (windowH === 0 || leaves.length === 0) return null;

    return (
        <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden
        >
            {leaves.map((leaf) => {
                const startY = -leaf.size * 2;
                const endY = windowH + leaf.size * 2;
                return (
                    <motion.div
                        key={leaf.id}
                        className="absolute"
                        style={{
                            left: `${leaf.left}%`,
                            top: 0,
                            opacity: leaf.opacity,
                            willChange: "transform",
                        }}
                        initial={{ y: startY, x: 0, rotate: 0 }}
                        animate={{
                            y: [startY, endY],
                            x: [
                                0,
                                leaf.swayAmp,
                                -leaf.swayAmp,
                                leaf.swayAmp * 0.5,
                                0,
                            ],
                            rotate: [0, 360 * leaf.rotateDirection],
                        }}
                        transition={{
                            y: {
                                duration: leaf.fallDuration,
                                repeat: Infinity,
                                ease: "linear",
                                delay: leaf.startDelay,
                            },
                            x: {
                                duration: leaf.swayDuration,
                                repeat: Infinity,
                                ease: "easeInOut",
                            },
                            rotate: {
                                duration: leaf.rotateDuration,
                                repeat: Infinity,
                                ease: "linear",
                            },
                        }}
                    >
                        <PixelLeaf
                            shape={LEAF_SHAPES[leaf.shape]}
                            color={leaf.color}
                            size={leaf.size}
                        />
                    </motion.div>
                );
            })}
        </div>
    );
}
