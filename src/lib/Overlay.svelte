<script>
    import {onMount} from "svelte";
    import {fit} from "@leveluptuts/svelte-fit";
    import Sockette from "sockette";
    import {meta} from "tinro";
    const route = meta();

    import TTLCache from "@isaacs/ttlcache";
    const player_stats_cache = new TTLCache({
        // Cache for 15 minutes.
        ttl: 15 * 60 * 1000,
    });

    import {get_winrate} from "../utils.js";

    const player_url = (profile_id, leaderboard_id) => `https://legacy.aoe2companion.com/api/leaderboard?game=aoe2de&leaderboard_id=${leaderboard_id}&count=1&profile_id=${profile_id}`;
    const match_url = (profile_id) => `https://legacy.aoe2companion.com/api/player/matches?game=aoe2de&start=0&count=1&profile_ids=${profile_id}`;

	let settings = {
		steam_id: route.query?.steam_id,
        profile_id: route.query?.profile_id,
        periodic_check: {
            timer: 0,
            interval: 30 * 1000,
        },
        player_colors: [
            "#6599d8",
            "#f25f5f",
            "#00ee00",
            "#ffd700",
            "#00eeee",
            "#ea69e1",
            "#808080",
            "#ff8c00",
        ],
        servers: {
            ukwest: "UK West",
            westeurope: "EU West",
            eastus: "US East",
            westus2: "US West 2",
            westus3: "US West 3",
            brazilsouth: "BR South",
            southeastasia: "Asia SE",
            westindia: "India West",
            centralindia: "India Central",
            koreacentral: "Korea Central",
            australiasoutheast: "Australia SE",
        },
        use_websocket: (route.query?.k) ? true : (route.query?.use_websocket === "true") ? true : false,
        show_1v1_rating: true,
        show_player_colors_before_name: true,
        use_ingame_name: true,
        align_right: route.query?.align_right === "true",
	};

	let current_match = {};
    let current_players = {};
    let show_error = false;

    async function set_static_data() {
        const response = await fetch("https://raw.githubusercontent.com/denniske/aoe2companion/master/app/assets/strings/en.json.lazy");
        const {civ, game_type, leaderboard, map_size, map_type, rating_type} = await response.json();

        const prepare_data = (data) => data.reduce((data, item) => {
            data[item.id] = item.string;
            return data;
        }, {});

        // Set static data.
        settings["civs"] = prepare_data(civ);
        settings["game_type"] = prepare_data(game_type);
        settings["leaderboard"] = prepare_data(leaderboard);
        settings["map_size"] = prepare_data(map_size);
        settings["map_type"] = prepare_data(map_type);
        settings["rating_type"] = prepare_data(rating_type);
    }

    async function set_data() {
        await set_current_match();
        if (!current_match) return;

        settings.leaderboard_id = current_match.leaderboard_id;
        await set_current_players();
    }

    async function set_websocket_data() {

        const socket = new Sockette("wss://aoe2recs.com/dashboard/overlay-api/", {
            timeout: 10_000,
            maxAttempts: Infinity,
            onopen: (e) => {
                console.log("Connected!", e);
                show_error = false;

                // Set expected leaderboard ID.
                if (settings.show_1v1_rating) {
                    settings.leaderboard_id = 3;
                }
            },
            onmessage: async (event) => {
                show_error = false;

                try {
                    const data = JSON.parse(event.data)?.data ?? JSON.parse(event.data) ?? "";
                    if (data && (data?.data || data?.match || data?.player)) {
                        console.log("data:", data);
                    }

                    const {player, match} = data;

                    if (!player) return;

                    // Store watched player.
                    player.profile_id = player?.id;
                    player.civ = player?.civilization;
                    settings.player = player;

                    if (!match) {

                        // Show watched player.
                        if (player && Object.keys(current_match).length < 1) {
                            current_players = {
                                [player.id]: {
                                    rating: settings.show_1v1_rating && player?.mmr_rm_1v1 ? player?.mmr_rm_1v1 : player?.mmr_rm_tg,
                                    rank: player?.rank_rm_1v1,
                                    profile_id: player?.id,
                                    country: player?.country_code,
                                    is_tg_mmr_fallback: settings.show_1v1_rating && !player?.mmr_rm_1v1,
                                },
                            };

                            current_match = {
                                players: [
                                    player,
                                ],
                            };
                        }

                        return;
                    }

                    if (!match?.teams) return;

                    const current_match_players = [];

                    // Make watched player team always first.
                    match.teams.sort((a, b) => {
                        if (a.includes(player.id)) {
                            return -1;
                        }
                        return 1;
                    });

                    const profile_ids = match.teams.flat();
                    const players = await get_player_stats(profile_ids);

                    // Prepare current players.
                    for (const team of match.teams) {
                        for (const player_id of team) {
                            const found_player = match.players.find((p) => p.id === player_id);
                            if (!found_player) continue;

                            found_player.profile_id = found_player.id;
                            found_player.civ = found_player?.civilization;
                            found_player.team = team;
                            current_match_players.push(found_player);
                        }
                    }

                    // Make watched player always first.
                    current_match_players.sort((a, b) => {
                        if (a.profile_id === player.id) {
                            return -1;
                        }
                        return 1;
                    });

                    // Detect players best alt accounts.
                    for (let i = 0; i < current_match_players.length; i++) {
                        const player = current_match_players[i];
                        const {rating, accounts = []} = players[player.profile_id] ?? "";

                        let largest_rating = rating;
                        let alt_name;
                        let alt_country;
                        for (const account of accounts) {
                            let player_stats;
                            if (settings.show_1v1_rating) {
                                player_stats = account.stats["1v1"];

                                // Fallback to TG MMR.
                                if (!player_stats) {
                                    player_stats = account.stats["tg"];
                                }
                            } else {
                                player_stats = account.stats["tg"];
                            }

                            if (!player_stats) continue;

                            if (player_stats.rating > largest_rating) {
                                largest_rating = player_stats.rating;
                                alt_name = account.username;
                                alt_country = account.country;
                            }
                        }

                        if (largest_rating == rating) continue;

                        current_match_players[i].is_smurf = true;
                        current_match_players[i].alt_name = alt_name;
                        current_match_players[i].alt_country = alt_country;
                        current_match_players[i].alt_rating = largest_rating;
                    }

                    current_players = players;
                    match.players = current_match_players;
                    current_match = match;

                } catch (error) {
                    console.error("JSON ERROR", error);
                }
            },
            onreconnect: (event) => {
                show_error = false;
                console.log("Reconnecting...", event);
            },
            onmaximum: (event) => console.log("Stop Attempting!", event),
            onclose: (event) => {
                show_error = true;
                console.log("Closed!", event);
            },
            onerror: (event) => {
                show_error = true;
                console.log("Error:", event);
            },
        });

        async function get_player_stats(profile_ids) {
            const cached_players = {};

            // Remove cached profile IDs.
            const cached_profile_ids = [];
            for (const profile_id of profile_ids) {

                if (player_stats_cache.has(`${profile_id}`)) {
                    cached_players[profile_id] = player_stats_cache.get(`${profile_id}`);

                    cached_profile_ids.push(profile_id);
                }
            }
            profile_ids = profile_ids.filter((profile_id) => !cached_profile_ids.includes(profile_id));

            // New profile IDs check.
            if (profile_ids.length < 1) {
                return cached_players;
            }

            const players = await check_players(profile_ids);

            // Modify players.
            for (let [profile_id, player] of Object.entries(players)) {
                let player_stats;
                if (settings.show_1v1_rating) {
                    player_stats = player.stats["1v1"];

                    // Fallback to TG MMR.
                    if (!player_stats) {
                        player.is_tg_mmr_fallback = true;
                        player_stats = player.stats["tg"];
                    }
                } else {
                    player_stats = player.stats["tg"];
                }

                const {wins = 0, losses = 0} = player_stats ?? "";
                const number_of_games = wins + losses;
                const winrate = get_winrate({wins, number_of_games});

                player = {
                    ...player,
                    ...player_stats,
                    number_of_games,
                    winrate,
                };

                player_stats_cache.set(`${profile_id}`, player);
                players[profile_id] = player;
            }

            return {
                ...cached_players,
                ...players,
            };
        }

        async function check_players(profile_ids) {
            const response = await fetch(`https://aoe2-api.neyl.dev/v0/check-players?profile_ids=${profile_ids.join(",")}`).catch((error) => {
                console.error("Check players fetch error:", error);
            });

            if (!response?.ok) {
                console.error(`Check players response not ok! Status: ${response?.status}`);
                return {};
            }

            const json = await response.json();
            return json;
        }
    }

    async function set_current_match() {
        [current_match] = await get_current_match();
        if (!current_match) return;

        // Make watched player always first.
        current_match.players.sort((a, b) => {
            if (a.profile_id == settings.profile_id) {
                return -1;
            } else {
                return 1;
            }
        });

        const watched_player_team = current_match.players.find((player) => player.profile_id == settings.profile_id)?.team;
        if (!watched_player_team) return console.error("Did not find watched player team!");

        // Make watched player team always first.
        for (const player of current_match.players) {
            if (player.team === watched_player_team) {
                player.team = 0;
            }
        }

        current_match.players.sort((a, b) => {
            return a.team - b.team;
        });
    }

    async function get_current_match() {
        try {
            const response = await fetch(match_url(settings.profile_id));
            if (!response.ok) return [];

            const json = await response.json();
            return json;
        } catch (error) {
            console.error(error);
        }

        return [];
    }

    async function set_current_players() {

        for (const {profile_id} of current_match.players) {
            const {leaderboard: player} = await get_current_player(profile_id);

            // Data check.
            if (!Array.isArray(player) || player?.length < 1) continue;

            // Stats.
            const wins = player[0].wins;
			const losses = player[0].losses;
			const number_of_games = wins + losses;

            // Winrate.
            const winrate = get_winrate({wins, number_of_games});

            // Overwrite.
            player[0].winrate = winrate;
            player[0].number_of_games = number_of_games;
            current_players[profile_id] = player[0];
        }
    }

    async function get_current_player(profile_id) {
        if (!settings.leaderboard_id) return {};

        try {
            const response = await fetch(player_url(profile_id, settings.leaderboard_id));
            if (!response.ok) return {};

            const json = await response.json();
            return json;
        } catch (error) {
            console.error(error);
        }

        return {};
    }

	function start_periodic_check() {
		if (settings.periodic_check.timer) return;

		// Refresh data on interval.
		settings.periodic_check.timer = setInterval(() => {
			set_data();
		}, settings.periodic_check.interval);
	}

	window.stop_periodic_check = () => {
		clearInterval(settings.periodic_check.timer);
		settings.periodic_check.timer = 0;
	}

    onMount(async () => {
        if (!settings.steam_id && !settings.profile_id) return;

        if (settings?.use_websocket) {
            set_websocket_data();
        } else {
            set_static_data();
            set_data();
		    start_periodic_check();
        }
	});

</script>

<div class="overlay" class:-right={settings?.align_right}>
    <!-- Error icon. -->
    {#if (show_error)}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="red" class="error-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
    {/if}

    {#if (current_match && Object.keys(current_match).length > 0)}

        <div class="match-info">
            <!-- Lobby name. -->
            {#if (current_match?.lobby_name)}
                <strong>{current_match.lobby_name}</strong>
                <br>
            {/if}

            <!-- Indicate queuing. -->
            {#if (settings?.player?.status?.toLowerCase() === "queuing")}
                <svg width="19" height="19" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#fff" class="spinner"><path d="M12 1a11 11 0 1 0 11 11A11 11 0 0 0 12 1Zm0 19a8 8 0 1 1 8-8 8 8 0 0 1-8 8Z" opacity=".25"/><path d="M10.14 1.16a11 11 0 0 0-9 8.92A1.59 1.59 0 0 0 2.46 12a1.52 1.52 0 0 0 1.65-1.3 8 8 0 0 1 6.66-6.61A1.42 1.42 0 0 0 12 2.69a1.57 1.57 0 0 0-1.86-1.53Z" class="spinner-inner"/></svg>
                {settings.player.status.toUpperCase()}
                |
            {/if}

            <!-- Map type. -->
            {#if (settings?.map_type)}
                {settings.map_type[current_match.map_type]}
                |
            {:else if (current_match?.map)}
                {current_match.map}
                |
            {/if}

            <!-- Game type. -->
            {#if (settings?.leaderboard)}
                {settings.leaderboard[current_match.leaderboard_id]}
            {:else}
                {#if (current_match?.game_type)}
                    {current_match.game_type}
                {/if}

                <!-- Diplomacy. -->
                {#if (current_match?.diplomacy)}
                    {current_match.diplomacy}
                {/if}

                <!-- Team size. -->
                {#if (current_match?.team_size && current_match?.team_size !== current_match?.diplomacy)}
                    {current_match.team_size}
                {/if}
            {/if}

            <!-- Server name. -->
            {#if (current_match?.server)}
                |
                {settings.servers[current_match.server.toLowerCase()] ?? current_match.server}
            {/if}
        </div>

        {#if (current_match.players)}
            {@const is_team_game = current_match.players.length > 2}
            {@const max_font_size = (!is_team_game) ? 24 : 20}

            <div class={`players ${is_team_game ? "-team" : ""}`}>
                {#each current_match.players as player, index (player.profile_id)}
                    {@const is_another_team = (is_team_game && index > 0 && index < current_match.players.length - 1 && player.team !== current_match.players[index + 1].team)}

                    <div class={`player ${is_another_team ? "-border" : ""}`}>
                        <div class="player-civ-name-container">
                            <!-- Civ image. -->
                            {#if (settings?.civs || player?.civilization)}
                                {@const civ_image_url = `https://aoe2techtree.net/img/Civs/${settings?.civs ? settings.civs[player.civ].toLowerCase() : player.civilization.toLowerCase()}.png`}
                                {@const civ_flag_size = (!is_team_game) ? 30 : 25}

                                <div class="player-civ">
                                    <img src={civ_image_url} class="civ-flag" width={civ_flag_size} height={civ_flag_size} alt="">
                                    <span class="player-civ-name">{settings?.civs ? settings.civs[player.civ] : player.civilization}</span>

                                    {#if (!settings.show_player_colors_before_name && is_team_game && player?.color_id >= 0)}
                                        <div class="player-color" style:background-color={[settings.player_colors[player.color_id]]}>
                                            {player.color_id + 1}
                                        </div>
                                    {/if}
                                </div>
                            {/if}

                            <div class="player-name-wrap">
                                <!-- Player country. -->
                                {#if (current_players[player.profile_id]?.country)}
                                    <img src={`https://flagicons.lipis.dev/flags/1x1/${current_players[player.profile_id].country.toLowerCase()}.svg`} class="flag" width="20" height="20" alt={current_players[player.profile_id].country}>
                                {/if}

                                <!-- Player color & team number. -->
                                {#if (settings.show_player_colors_before_name && is_team_game && player?.color_id >= 0)}
                                    <div class="player-color" style:background-color={[settings.player_colors[player.color_id]]}>
                                        {player.color_id + 1}
                                    </div>
                                {/if}

                                <!-- Player name. -->
                                <div class="player-name-inner">
                                    <span use:fit={{min_size: 14, max_size: max_font_size}}>
                                        {#if (settings.use_ingame_name && player?.user_name)}
                                            {player.user_name}
                                        {:else}
                                            {player.name}
                                        {/if}
                                    </span>
                                </div>
                            </div>

                            <!-- Alt account. -->
                            {#if (player?.is_smurf)}
                                <div class="player-name-wrap -smurf">
                                    <!-- Alt account country. -->
                                    {#if (is_team_game && player?.alt_country)}
                                        <img src={`https://flagicons.lipis.dev/flags/1x1/${player.alt_country.toLowerCase()}.svg`} class="flag" width="20" height="20" alt={player.alt_country}>
                                    {/if}

                                    <!-- Smurf icon. -->
                                    <img src="/images/icon-smurf.png" class="smurf-icon" width="20" height="20" alt="">

                                    <!-- Alt account name. -->
                                    <div class="player-name-inner">
                                        <span use:fit={{min_size: 14, max_size: max_font_size}}>
                                            {player.alt_name}
                                        </span>
                                    </div>
                                </div>
                            {/if}
                        </div>

                        {#if (current_players[player.profile_id])}
                            <!-- Player rating. -->
                            {#if (current_players[player.profile_id]?.rating)}
                                <span class={`rating ${(player?.is_smurf) ? "-smurf" : ""}`}>
                                    {#if (player?.is_smurf)}
                                        {player.alt_rating}
                                    {:else}
                                        {current_players[player.profile_id].rating}
                                    {/if}

                                    <!-- Indicate TG MMR fallback -->
                                    {#if (current_players[player.profile_id]?.is_tg_mmr_fallback)}
                                        <span class="team-game-rating">TG</span>
                                    {/if}

                                    <span class="rating-mmr">MMR</span>
                                </span>
                            {/if}

                            <!-- Player rank. -->
                            {#if (current_players[player.profile_id]?.rank && current_players[player.profile_id]?.rank > 0)}
                                <span class="rank">(#{current_players[player.profile_id].rank})</span>
                            {/if}

                            <!-- New line for 1v1 games. -->
                            {#if (!is_team_game)}
                                <br>
                            {/if}

                            <!-- Player wins. -->
                            {#if (current_players[player.profile_id]?.wins)}
                                <span class="win">{current_players[player.profile_id].wins}W</span>
                            {/if}

                            <!-- Player losses. -->
                            {#if (current_players[player.profile_id]?.losses)}
                                <span class="loss">{current_players[player.profile_id].losses}L</span>
                            {/if}

                            <!-- Player winrate. -->
                            {#if (current_players[player.profile_id]?.winrate && !isNaN(current_players[player.profile_id]?.winrate))}
                                <div class="winrate">
                                    <span>{current_players[player.profile_id].winrate}%</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" class="winrate-icon"><path fill="#fff" d="M5 0c0 9.803 5.105 12.053 5.604 16h2.805c.497-3.947 5.591-6.197 5.591-16h-14zm7.006 14.62c-.408-.998-.969-1.959-1.548-2.953-1.422-2.438-3.011-5.162-3.379-9.667h9.842c-.368 4.506-1.953 7.23-3.372 9.669-.577.993-1.136 1.954-1.543 2.951zm-.006-3.073c-1.125-2.563-1.849-5.599-1.857-8.547h-1.383c.374 3.118 1.857 7.023 3.24 8.547zm12-9.547c-.372 4.105-2.808 8.091-6.873 9.438.297-.552.596-1.145.882-1.783 2.915-1.521 4.037-4.25 4.464-6.251h-2.688c.059-.45.103-.922.139-1.405h4.076zm-24 0c.372 4.105 2.808 8.091 6.873 9.438-.297-.552-.596-1.145-.882-1.783-2.915-1.521-4.037-4.25-4.464-6.251h2.688c-.058-.449-.102-.922-.138-1.404h-4.077zm13.438 15h-2.866c-.202 1.187-1.63 2.619-3.571 2.619v4.381h10v-4.381c-1.999 0-3.371-1.432-3.563-2.619zm2.562 6h-8v-2h8v2z"></path></svg>
                                </div>
                            {/if}
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

	{/if}
</div>

<style>
    .overlay {
        position: relative;
        width: 420px;
        background: linear-gradient(90deg, rgba(51,51,51,1) 0%, rgba(51,51,51,1) 100%);
        padding: 10px;
    }
    .overlay.-right {
        margin-left: auto;
    }
    .overlay:empty {
        padding: 0;
    }

    .error-icon {
        width: 30px;
        height: auto;
        position: absolute;
        top: 8px;
        left: 8px;
    }

    .match-info {
        font-size: 18px;
        text-align: center;
        margin-bottom: 10px;
    }

    .spinner {
        position: relative;
        top: 3px;
    }
    .spinner .spinner-inner {
        transform-origin: center;
        animation: spin 1s infinite linear;
    }
    @keyframes spin {
        to {
            transform:rotate(360deg)
        }
    }

    .players {
        --columns: 2;

        display: grid;
        grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
        column-gap: 10px;
        row-gap: 3px;
        font-size: 20px;
    }
    .players.-team {
        --columns: 1;
    }

    .player.-border {
        padding-bottom: 5px;
        border-bottom: 1px solid #fff;
        margin-bottom: 3px;
    }

    .players.-team .player-civ-name-container {
        display: grid;
        grid-template-columns: minmax(0, 60%) minmax(0, 40%);
        column-gap: 10px;
    }
    .player-civ {
        display: flex;
        align-items: center;
        font-size: 0.9em;
    }
    .players.-team .player-civ {
        order: 2;
    }
    .player-civ-name {
        flex-grow: 1;
    }
    .players.-team .player-civ-name {
        font-size: 0.9em;
    }
    .player-color {
        --width: 17px;
        --height: var(--width);
        --font-size: 80%;
        --color: #000;

        width: var(--width);
        height: var(--height);
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-shrink: 0;
        color: var(--color);
        font-size: var(--font-size);
        font-family: monospace;
        font-weight: bold;
    }

    .player-name-wrap {
        display: flex;
        align-items: center;
    }
    .player-name-wrap.-smurf {
        order: 2;
    }
    .player-name-wrap .player-color {
        --width: 20px;
        margin-right: 7px;
        margin-left: -3px;
    }

    .civ-flag {
        margin-right: 4px;
    }

    .player-name-inner {
        max-width: calc(100% - 20px - 7px);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .flag {
        border-radius: 50%;
        margin-right: 7px;
    }
    .smurf-icon {
        margin-right: 7px;
    }
    .flag + .smurf-icon {
        margin-left: -3px;
    }

    .rating {
        color: #D2AF26;
        font-size: 0.95em;
    }
    .rating.-smurf {
        color: yellow;
    }
    .players.-team .rating {
        font-size: 0.85em;
    }
    .team-game-rating {
        color: #00dcf3;
    }

    .rank {
        font-size: 0.8em;
    }
    .players.-team .rank {
        font-size: 0.75em;
    }

    .winrate {
        display: flex;
        align-items: center;
        font-size: 0.88em;
    }
    .players.-team .winrate {
        font-size: 0.8em;
    }
    .players.-team .winrate {
        display: inline-flex;
    }

    .winrate-icon {
        margin-left: 5px;
    }

    .win {
        color: rgb(34 197 94);
    }
    .loss {
        color: rgb(237 83 83);
    }
    .players.-team .win, .players.-team .loss {
        font-size: 0.85em;
    }
</style>

