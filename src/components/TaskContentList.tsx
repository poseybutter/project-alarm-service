import type { ContentItem } from "@/shared/types";
import { formatWorkload } from "@/shared/utils/utils";

const STATUS_COLORS: Record<string, string> = {
    "대기": "bg-stone-100 text-stone-500",
    "시작 전": "bg-stone-100 text-stone-500",
    "진행중": "bg-blue-100 text-blue-700",
    "지연/보류": "bg-red-100 text-red-700",
    "완료": "bg-green-100 text-green-700",
};

type TaskContentListProps = {
    content: string;
    contentItems?: ContentItem[] | null;
    className?: string;
    itemClassName?: string;
};

export default function TaskContentList({
    content,
    contentItems,
    className = "",
    itemClassName = "",
}: TaskContentListProps) {
    if (contentItems && contentItems.length > 0) {
        return (
            <div className={`space-y-1 ${className}`}>
                {contentItems.filter((ci) => ci.text.trim()).map((ci, index) => (
                    <div
                        key={`${index}-${ci.text}`}
                        className={`flex min-w-0 items-start gap-1.5 ${itemClassName}`}
                    >
                        <span aria-hidden="true" className="shrink-0">&rArr;</span>
                        <span className={`min-w-0 break-words ${ci.status === "완료" ? "line-through text-stone-400" : ""}`}>{ci.text}</span>
                        {ci.status && (
                            <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${STATUS_COLORS[ci.status] || "bg-stone-100 text-stone-500"}`}>
                                {ci.status}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    const items = content
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

    if (items.length === 0) return null;

    return (
        <div className={`space-y-1 ${className}`}>
            {items.map((item, index) => (
                <div
                    key={`${index}-${item}`}
                    className={`flex min-w-0 items-start gap-1.5 ${itemClassName}`}
                >
                    <span aria-hidden="true" className="shrink-0">
                        &rArr;
                    </span>
                    <span className="min-w-0 break-words">{item}</span>
                </div>
            ))}
        </div>
    );
}
