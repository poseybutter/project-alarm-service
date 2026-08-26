import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clearAuthCookies } from "@/lib/server/authCookies";

export async function POST(req: NextRequest) {
    const store = await cookies();

    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || "",
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
            {
                cookies: {
                    getAll() {
                        return store.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            store.set(name, value, options);
                        });
                    },
                },
            },
        );
        await supabase.auth.signOut({ scope: "local" });
    } catch {
        // Invalid refresh token cleanup must continue even if Supabase signOut fails.
    }

    const res = NextResponse.json({ ok: true });
    clearAuthCookies(req, res);
    return res;
}
