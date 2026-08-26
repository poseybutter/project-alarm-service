export async function sendToGoogleChat(payload: {
    type: "level_up";
    memberName: string;
    levelName: string;
}) {
    try {
        const res = await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return res.ok;
    } catch (e) {
        console.error("Google Chat send failed:", e);
        return false;
    }
}

export async function sendLevelUpMessage(memberName: string, levelName: string) {
    return sendToGoogleChat({ type: "level_up", memberName, levelName });
}
