// Optional online leaderboard backed by Supabase through SnapCloud. Reads and
// writes scores via the snapCloudRequirements component, resolving either
// comp.api[name] or comp[name].

const supabaseModule = require("SupabaseClient.lspkg/supabase-snapcloud");
const createClient: any = (supabaseModule && supabaseModule.createClient) ? supabaseModule.createClient : supabaseModule;

interface OwnScoreResult {
    score: number | null;
    rank: number | null;
}

@component
export class SupabaseTable extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>SnapCloud</font>"}
    @input
    @hint("SnapCloudRequirements component for credentials.")
    public snapCloudRequirements!: ScriptComponent;

    @input
    @hint("Supabase table to read/write scores from.")
    public tableName: string = "global_leaderboard";
    // @ui {"widget":"group_end"}

    private client: any = null;
    private uid: string | null = null;
    private displayName: string = "";

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.setupUser();
            this.initSupabase();
        });
        this.createEvent("OnDestroyEvent").bind(() => {
            try { if (this.client && this.client.removeAllChannels) this.client.removeAllChannels(); } catch (e) {}
        });
    }

    private log(msg: string): void { print("[SupabaseTable] " + msg); }

    private callRequirements(name: string, ...args: any[]): any {
        const comp: any = this.snapCloudRequirements;
        if (!comp) return null;
        if (comp.api && typeof comp.api[name] === "function") return comp.api[name].apply(comp.api, args);
        if (typeof comp[name] === "function") return comp[name].apply(comp, args);
        return null;
    }

    private setupUser(): void {
        if (global.userContextSystem && global.userContextSystem.requestDisplayName) {
            global.userContextSystem.requestDisplayName((name) => { this.displayName = name || ""; });
        }
    }

    private async initSupabase(): Promise<void> {
        if (!this.snapCloudRequirements) { this.log("SnapCloudRequirements not configured"); return; }

        const isConfigured = this.callRequirements("isConfigured");
        if (!isConfigured) { this.log("SnapCloudRequirements not configured"); return; }

        const supabaseProject = this.callRequirements("getSupabaseProject");
        if (!supabaseProject) { this.log("Could not retrieve Supabase project"); return; }

        if (!createClient) { this.log("Supabase createClient not found; ensure package is included"); return; }

        this.client = createClient(supabaseProject.url, supabaseProject.publicToken, {
            realtime: { heartbeatIntervalMs: 2500 },
        });
        this.log("Client initialized");
        await this.signInUser();
    }

    private async signInUser(): Promise<void> {
        if (!this.client || !this.client.auth) { this.log("Client or auth not available"); return; }
        try {
            const result = await this.client.auth.signInWithIdToken({ provider: "snapchat", token: "" });
            if (result.error) {
                this.log("Sign in error: " + JSON.stringify(result.error));
            } else if (result.data && result.data.user) {
                this.uid = "" + result.data.user.id;
                this.log("Signed in user " + this.uid);

                const bestTime = global.persistentStorage.getStat("fastestEscape") ?? 0;
                const rounds = global.persistentStorage.getStat("roundPlayed") ?? 0;
                this.tryUpdateScore(bestTime, rounds);
            }
        } catch (e) {
            this.log("Sign in exception: " + e);
        }
    }

    public tryUpdateScore = async (newScore: number | string, rounds: number, callback?: (ok: boolean) => void): Promise<void> => {
        const done = (ok: boolean): void => { if (callback) callback(!!ok); };

        if (!this.client || !this.uid) { this.log("Cannot update score: client or user not ready"); done(false); return; }
        const numeric = typeof newScore === "string" ? parseFloat(newScore) : newScore;
        if (!isFinite(numeric)) { this.log("Invalid score"); done(false); return; }

        const table = this.tableName || "global_leaderboard";
        try {
            const existing = await this.client.from(table).select("score").eq("id", this.uid).maybeSingle();
            if (existing.error && existing.error.code !== "PGRST116") {
                this.log("Read score failed: " + JSON.stringify(existing.error));
                done(false); return;
            }
            const currentScore = existing.data ? existing.data.score : null;
            if (currentScore !== null && currentScore !== undefined && numeric >= currentScore) {
                this.log("Existing score is better or equal; keeping current score");
                done(false); return;
            }

            const payload = {
                id: this.uid,
                name: this.displayName || "User",
                score: numeric,
                sessions: rounds,
            };
            const write = await this.client.from(table).upsert(payload, { onConflict: "id" }).select();
            if (write.error) { this.log("Upsert failed: " + JSON.stringify(write.error)); done(false); }
            else { this.log("Score updated to " + numeric); done(true); }
        } catch (e) {
            this.log("Update score exception: " + e);
            done(false);
        }
    };

    public tryRetrieveOwnScore = async (callback?: (result: OwnScoreResult | null) => void): Promise<void> => {
        if (!this.client || !this.uid) { this.log("Cannot retrieve own score: client or user not ready"); if (callback) callback(null); return; }
        const table = this.tableName || "global_leaderboard";
        try {
            const selfRes = await this.client.from(table).select("score").eq("id", this.uid).maybeSingle();
            if (selfRes.error) { if (callback) callback(null); return; }
            const score: number | null = selfRes.data ? selfRes.data.score : null;
            if (score === null || score === undefined) { if (callback) callback({ score: null, rank: null }); return; }

            const countRes = await this.client.from(table).select("id", { count: "exact" }).lt("score", score);
            if (countRes.error) { this.log("Count failed: " + JSON.stringify(countRes.error)); if (callback) callback(null); return; }

            const rank = (countRes.count || 0) + 1;
            if (callback) callback({ score, rank });
        } catch (e) {
            this.log("Retrieve own score exception: " + e);
            if (callback) callback(null);
        }
    };

    public tryRetrieveRank = async (callback?: (rank: number | null) => void): Promise<void> => {
        if (!this.client || !this.uid) { this.log("Cannot retrieve rank: client or user not ready"); if (callback) callback(null); return; }
        const table = this.tableName || "global_leaderboard";
        try {
            const selfRes = await this.client.from(table).select("score").eq("id", this.uid).maybeSingle();
            if (selfRes.error) { this.log("Retrieve rank failed: " + JSON.stringify(selfRes.error)); if (callback) callback(null); return; }
            const score: number | null = selfRes.data ? selfRes.data.score : null;
            if (score === null || score === undefined) { if (callback) callback(null); return; }

            const countRes = await this.client.from(table).select("id", { count: "exact" }).lt("score", score);
            if (countRes.error) { this.log("Rank count failed: " + JSON.stringify(countRes.error)); if (callback) callback(null); return; }

            const rank = (countRes.count || 0) + 1;
            if (callback) callback(rank);
        } catch (e) {
            this.log("Retrieve rank exception: " + e);
            if (callback) callback(null);
        }
    };

    public tryDeleteOwnRecord = async (callback?: (ok: boolean) => void): Promise<void> => {
        const done = (ok: boolean): void => {
            if (callback) callback(!!ok);
        };

        if (!this.client || !this.uid) {
            this.log("Cannot delete cloud record: client or user not ready");
            done(false);
            return;
        }

        const table = this.tableName || "global_leaderboard";
        try {
            const res = await this.client.from(table).delete().eq("id", this.uid);
            if (res.error) {
                this.log("Delete failed: " + JSON.stringify(res.error));
                done(false);
                return;
            }
            this.log("Deleted cloud record for user " + this.uid);
            done(true);
        } catch (e) {
            this.log("Delete record exception: " + e);
            done(false);
        }
    };

    public tryRetrieveScoreboard = async (callback?: (results: { name: string; score: number }[] | null) => void): Promise<void> => {
        if (!this.client) { this.log("Cannot retrieve scoreboard: client not ready"); if (callback) callback(null); return; }
        const table = this.tableName || "global_leaderboard";
        try {
            const res = await this.client.from(table).select("name, score").order("score", { ascending: true }).limit(10);
            if (res.error) { this.log("Scoreboard failed: " + JSON.stringify(res.error)); if (callback) callback(null); return; }
            const rows = res.data || [];
            if (callback) callback(rows.map((row: any) => ({ name: row.name, score: row.score })));
        } catch (e) {
            this.log("Retrieve scoreboard exception: " + e);
            if (callback) callback(null);
        }
    };
}
