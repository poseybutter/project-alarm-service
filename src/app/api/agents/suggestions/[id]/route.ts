import { NextResponse, type NextRequest } from "next/server";
import { getServerCurrentTeamRole } from "@/lib/serverSupabase";
import { updateAgentSuggestionStatus } from "@/lib/agents/suggestions";
import type {
    AgentSuggestionStatus,
    GoogleChatCardPayload,
} from "@/lib/agents/types";

const REVIEW_STATUSES = new Set<AgentSuggestionStatus>([
    "approved",
    "dismissed",
    "applied",
]);

type RouteContext = {
    params: Promise<{ id: string }>;
};

type PatchBody =
    | { status?: string }
    | {
          action: "removeWidget";
          sectionIndex: number;
          widgetIndex: number;
      }
    | {
          action: "editWidget";
          sectionIndex: number;
          widgetIndex: number;
          text: string;
      };

function isCardPayload(value: unknown): value is GoogleChatCardPayload {
    return (
        value !== null &&
        typeof value === "object" &&
        "sections" in value &&
        Array.isArray((value as GoogleChatCardPayload).sections)
    );
}

function payloadRecipient(payload: unknown) {
    if (!payload || typeof payload !== "object") return null;
    const recipient = (payload as { recipientMember?: unknown }).recipientMember;
    return typeof recipient === "string" ? recipient : null;
}

function cardToPlainText(card: GoogleChatCardPayload) {
    const lines = [card.title, card.subtitle ?? ""].filter(Boolean);
    for (const section of card.sections) {
        if (section.header) lines.push("", section.header);
        for (const widget of section.widgets) {
            lines.push(
                widget.textParagraph.text
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/<[^>]*>/g, "")
                    .replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">"),
            );
        }
    }
    return lines.join("\n").trim();
}

function escapeGChatText(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}

export async function PATCH(req: NextRequest, context: RouteContext) {
    const { supabase, user, role, teamId } = await getServerCurrentTeamRole();
    if (!user?.email || !role || !teamId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const suggestionId = Number(id);
    if (!Number.isInteger(suggestionId)) {
        return NextResponse.json({ message: "Invalid id" }, { status: 400 });
    }

    let body: PatchBody;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }

    try {
        const { data: player, error: playerError } = await supabase
            .from("players")
            .select("name")
            .eq("team_id", teamId)
            .eq("email", user.email)
            .maybeSingle();
        if (playerError) throw playerError;

        const { data: existing, error: existingError } = await supabase
            .from("agent_suggestions")
            .select("*")
            .eq("team_id", teamId)
            .eq("id", suggestionId)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) {
            return NextResponse.json(
                { message: "Suggestion not found" },
                { status: 404 },
            );
        }

        const recipient = payloadRecipient(existing.payload);
        const isOwner = Boolean(player?.name && recipient === player.name);

        if ("action" in body) {
            if (!isOwner && role !== "admin") {
                return NextResponse.json(
                    { message: "Forbidden" },
                    { status: 403 },
                );
            }

            const payload = existing.payload as Record<string, unknown>;
            const card = payload.card;
            if (!isCardPayload(card)) {
                return NextResponse.json(
                    { message: "Suggestion does not have editable card" },
                    { status: 400 },
                );
            }

            const section = card.sections[body.sectionIndex];
            const widget = section?.widgets[body.widgetIndex];
            if (!section || !widget) {
                return NextResponse.json(
                    { message: "Invalid card item index" },
                    { status: 400 },
                );
            }

            const nextCard: GoogleChatCardPayload = {
                ...card,
                sections: card.sections
                    .map((currentSection, sectionIndex) => {
                        if (sectionIndex !== body.sectionIndex) {
                            return currentSection;
                        }

                        if (body.action === "removeWidget") {
                            return {
                                ...currentSection,
                                widgets: currentSection.widgets.filter(
                                    (_currentWidget, widgetIndex) =>
                                        widgetIndex !== body.widgetIndex,
                                ),
                            };
                        }

                        return {
                            ...currentSection,
                            widgets: currentSection.widgets.map(
                                (currentWidget, widgetIndex) =>
                                    widgetIndex === body.widgetIndex
                                        ? {
                                              textParagraph: {
                                                  text: escapeGChatText(
                                                      body.text.trim(),
                                                  ),
                                              },
                                          }
                                        : currentWidget,
                            ),
                        };
                    })
                    .filter((currentSection) => currentSection.widgets.length > 0),
            };

            const nextPayload = {
                ...payload,
                card: nextCard,
                text: cardToPlainText(nextCard),
            };

            const { data: updated, error: updateError } = await supabase
                .from("agent_suggestions")
                .update({
                    payload: nextPayload,
                    reviewed_by: user.email,
                    reviewed_at: new Date().toISOString(),
                })
                .eq("team_id", teamId)
                .eq("id", suggestionId)
                .select("*")
                .maybeSingle();
            if (updateError) throw updateError;
            return NextResponse.json({ suggestion: updated });
        }

        if (!body.status || !REVIEW_STATUSES.has(body.status as AgentSuggestionStatus)) {
            return NextResponse.json(
                { message: "status must be approved, dismissed, or applied" },
                { status: 400 },
            );
        }

        if (role !== "admin") {
            if (body.status !== "dismissed" || !isOwner) {
                return NextResponse.json(
                    { message: "Forbidden" },
                    { status: 403 },
                );
            }
        }

        const suggestion = await updateAgentSuggestionStatus(supabase, {
            id: suggestionId,
            teamId,
            status: body.status as Exclude<AgentSuggestionStatus, "pending">,
            reviewedBy: user.email,
        });
        return NextResponse.json({ suggestion });
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Failed to update suggestion";
        return NextResponse.json({ message }, { status: 500 });
    }
}
