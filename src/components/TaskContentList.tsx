import type { ContentItem } from "@/shared/types";
import { CONTENT_ITEM_STATUS_COLORS } from "@/shared/constants";

const STATUS_COLORS = CONTENT_ITEM_STATUS_COLORS;

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
