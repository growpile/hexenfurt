// Supabase leaderboard helper for Lens Studio
// @input Component.ScriptComponent snapCloudRequirements
// @input string tableName = "global_leaderboard"

var supabaseModule = require('SupabaseClient.lspkg/supabase-snapcloud');
var createClient = supabaseModule && supabaseModule.createClient ? supabaseModule.createClient : supabaseModule;

var client = null;
var uid = null;
var displayName = "";

// Basic logger
function log(msg) { print("[SupabaseTable] " + msg); }

// Helpers to call SnapCloudRequirements (api or direct)
function callRequirements(name /* ...args */) {
    var comp = script.snapCloudRequirements;
    if (!comp) { return null; }
    var args = Array.prototype.slice.call(arguments, 1);
    if (comp.api && typeof comp.api[name] === "function") {
        return comp.api[name].apply(comp.api, args);
    }
    if (typeof comp[name] === "function") {
        return comp[name].apply(comp, args);
    }
    return null;
}

// Lifecycle
script.createEvent("OnStartEvent").bind(function () {
    setupUser();
    initSupabase();
});

script.createEvent("OnDestroyEvent").bind(function () {
    try {
        if (client && client.removeAllChannels) {
            client.removeAllChannels();
        }
    } catch (e) {}
});

function setupUser() {
    if (global.userContextSystem && global.userContextSystem.requestDisplayName) {
        global.userContextSystem.requestDisplayName(function (name) {
            displayName = name || "";
        });
    }
}

async function initSupabase() {
    if (!script.snapCloudRequirements) {
        log("SnapCloudRequirements not configured");
        return;
    }

    var isConfigured = callRequirements("isConfigured");
    if (!isConfigured) {
        log("SnapCloudRequirements not configured");
        return;
    }

    var supabaseProject = callRequirements("getSupabaseProject");
    if (!supabaseProject) {
        log("Could not retrieve Supabase project");
        return;
    }

    if (!createClient) {
        log("Supabase createClient not found; ensure package is included");
        return;
    }

    client = createClient(supabaseProject.url, supabaseProject.publicToken, {
        realtime: { heartbeatIntervalMs: 2500 }
    });
    log("Client initialized");
    await signInUser();
}

async function signInUser() {
    if (!client || !client.auth) {
        log("Client or auth not available");
        return;
    }
    try {
        var result = await client.auth.signInWithIdToken({ provider: "snapchat", token: "" });
        if (result.error) {
            log("Sign in error: " + JSON.stringify(result.error));
        } else if (result.data && result.data.user) {
            uid = "" + result.data.user.id;
            log("Signed in user " + uid);
            bestTime = global.persistentStorage.getStat("fastestEscape");
            rounds = global.persistentStorage.getStat("roundPlayed");
            script.supabaseTable.tryUpdateScore(bestTime, rounds);
        }
    } catch (e) {
        log("Sign in exception: " + e);
    }
}

// --- Public API -------------------------------------------------------------

/**
 * Inserts/updates the user's score if the new score is smaller (better).
 * Score is treated as a float.
 * callback(successBool) invoked when done.
 */
script.tryUpdateScore = async function (newScore, rounds, callback) {
    function done(ok) {
        if (callback) { callback(!!ok); }
    }

    if (!client || !uid) {
        log("Cannot update score: client or user not ready");
        done(false);
        return;
    }
    if (!isFinite(newScore)) {
        log("Invalid score");
        done(false);
        return;
    }

    var table = script.tableName || "global_leaderboard";
    try {
        // Fetch current score
        var existing = await client.from(table).select("score").eq("id", uid).maybeSingle();
        if (existing.error && existing.error.code !== "PGRST116") {
            log("Read score failed: " + JSON.stringify(existing.error));
            done(false);
            return;
        }

        var currentScore = existing.data ? existing.data.score : null;
        if (currentScore !== null && currentScore !== undefined && newScore >= currentScore) {
            log("Existing score is better or equal; keeping current score");
            done(false);
            return;
        }

        var payload = {
            id: uid,
            name: displayName || "User",
            score: newScore,
            sessions: rounds
        };

        var write = await client.from(table).upsert(payload, { onConflict: "id" }).select();
        if (write.error) {
            log("Upsert failed: " + JSON.stringify(write.error));
            done(false);
        } else {
            log("Score updated to " + newScore);
            done(true);
        }
    } catch (e) {
        log("Update score exception: " + e);
        done(false);
    }
};

/**
 * Retrieves the user's score and rank (1-based) in ascending order (smaller is better).
 * callback(result) where result = { score: number|null, rank: number|null }
 */
script.tryRetrieveOwnScore = async function (callback) {
    if (!client || !uid) {
        log("Cannot retrieve own score: client or user not ready");
        if (callback) { callback(null); }
        return;
    }

    var table = script.tableName || "global_leaderboard";
    try {
        var selfRes = await client.from(table).select("score").eq("id", uid).maybeSingle();
        if (selfRes.error) {
            if (callback) { callback(null); }
            return;
        }
        var score = selfRes.data ? selfRes.data.score : null;
        if (score === null || score === undefined) {
            if (callback) { callback({ score: null, rank: null }); }
            return;
        }

        // Count how many scores are strictly less to determine rank
        // Use full select (no head) because head requests can fail in Lens Studio fetch
        var countRes = await client.from(table).select("id", { count: "exact" }).lt("score", score);
        if (countRes.error) {
            log("Count failed: " + JSON.stringify(countRes.error));
            if (callback) { callback(null); }
            return;
        }

        var rank = (countRes.count || 0) + 1;
        if (callback) { callback({ score: score, rank: rank }); }
    } catch (e) {
        log("Retrieve own score exception: " + e);
        if (callback) { callback(null); }
    }
};

/**
 * Retrieves the user's current rank (1-based) using all entries ordered ascending.
 * callback(rank|null) invoked with null on error or if the user has no score yet.
 */
script.tryRetrieveRank = async function (callback) {
    if (!client || !uid) {
        log("Cannot retrieve rank: client or user not ready");
        if (callback) { callback(null); }
        return;
    }

    var table = script.tableName || "global_leaderboard";
    try {
        var selfRes = await client.from(table).select("score").eq("id", uid).maybeSingle();
        if (selfRes.error) {
            log("Retrieve rank failed: " + JSON.stringify(selfRes.error));
            if (callback) { callback(null); }
            return;
        }
        var score = selfRes.data ? selfRes.data.score : null;
        if (score === null || score === undefined) {
            if (callback) { callback(null); }
            return;
        }

        var countRes = await client.from(table).select("id", { count: "exact" }).lt("score", score);
        if (countRes.error) {
            log("Rank count failed: " + JSON.stringify(countRes.error));
            if (callback) { callback(null); }
            return;
        }

        var rank = (countRes.count || 0) + 1;
        if (callback) { callback(rank); }
    } catch (e) {
        log("Retrieve rank exception: " + e);
        if (callback) { callback(null); }
    }
};

/**
 * Retrieves top 10 scores ordered ascending (smaller is better).
 * callback(results) where results = [{ name, score }, ...]
 */
script.tryRetrieveScoreboard = async function (callback) {
    if (!client) {
        log("Cannot retrieve scoreboard: client not ready");
        if (callback) { callback(null); }
        return;
    }

    var table = script.tableName || "global_leaderboard";
    try {
        var res = await client.from(table).select("name, score").order("score", { ascending: true }).limit(10);
        if (res.error) {
            log("Scoreboard failed: " + JSON.stringify(res.error));
            if (callback) { callback(null); }
            return;
        }
        var rows = res.data || [];
        if (callback) { callback(rows.map(function (row) { return { name: row.name, score: row.score }; })); }
    } catch (e) {
        log("Retrieve scoreboard exception: " + e);
        if (callback) { callback(null); }
    }
};

// script.createEvent("TapEvent").bind(function() {
//     // function receivedOwnScore(score) {
//     //     print(score.score);
//     // }
//     // script.tryRetrieveOwnScore(receivedOwnScore);
//     script.tryUpdateScore(100, function(result) {
//         print(result);
//     })
// })
