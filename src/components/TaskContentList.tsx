type TaskContentListProps = {
    content: string;
    className?: string;
    itemClassName?: string;
};

export default function TaskContentList({
    content,
    className = "",
    itemClassName = "",
}: TaskContentListProps) {
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
