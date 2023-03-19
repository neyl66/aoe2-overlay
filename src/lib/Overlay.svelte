<script>
    import {onMount} from "svelte";
    import {fit} from "@leveluptuts/svelte-fit";
    import Sockette from "sockette";
    import {meta} from "tinro";
    const route = meta();

    const player_url = (profile_id, leaderboard_id) => `https://legacy.aoe2companion.com/api/leaderboard?game=aoe2de&leaderboard_id=${leaderboard_id}&count=1&profile_id=${profile_id}`;
    const match_url = (profile_id) => `https://legacy.aoe2companion.com/api/player/matches?game=aoe2de&start=0&count=1&profile_ids=${profile_id}`;

	let settings = {
		steam_id: route.query?.steam_id,
        profile_id: route.query?.profile_id,
        login: route.query?.k ? decodeURIComponent(route.query?.k) : undefined,
        periodic_check: {
            timer: 0,
            interval: 30 * 1000,
        },
        servers: {
            ukwest: "UK West",
            westeurope: "EU West",
            eastus: "US East",
            westus2: "US West 2",
            southeastasia: "Asia SE",
            westindia: "India West",
            koreacentral: "Korea Central",
            australiasoutheast: "Australia SE",
        },
        show_1v1_rating: true,
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
        if (settings?.login === "null") {
            settings.login = null;
        }

        const player_stats_cache = {};

        const socket = new Sockette("wss://aoe2recs.com/dashboard/overlay-api/", {
            timeout: 10_000,
            maxAttempts: Infinity,
            onopen: (e) => {
                console.log("Connected!", e);
                show_error = false;
                socket.json({
                    login: settings.login,
                });

                // Set expected leaderboard ID.
                if (settings.show_1v1_rating) {
                    settings.leaderboard_id = 3;
                }
            },
            onmessage: async (event) => {
                show_error = false;

                try {
                    console.log("data:", JSON.parse(event.data));

                    const {player, match, type} = JSON.parse(event.data)?.data ?? JSON.parse(event.data) ?? "";

                    if (!player) return console.error("No player!");

                    // Store watched player.
                    player.profile_id = player?.id;
                    player.civ = player?.civilization;
                    settings.player = player;

                    if (!match) {

                        // Show watched player.
                        if (player && Object.keys(current_match).length < 1) {
                            current_players = {
                                [player.id] : {
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
                                ]
                            };
                        }

                        return console.error("No match!");
                    }

                    if (!match?.teams) return console.error("No teams!");

                    const players = {};
                    const current_match_players = [];

                    // Make watched player team always first.
                    match.teams.sort((a, b) => {
                        if (a.includes(player.id)) {
                            return -1;
                        }
                        return 1;
                    });

                    // Prepare current players.
                    for (const team of match.teams) {
                        for (const player_id of team) {
                            const found_player = match.players.find((p) => p.id === player_id);

                            players[found_player.id] = {
                                rating: settings.show_1v1_rating && found_player?.mmr_rm_1v1 ? found_player?.mmr_rm_1v1 : found_player?.mmr_rm_tg,
                                rank: found_player?.rank_rm_1v1,
                                profile_id: found_player.id,
                                country: found_player?.country_code,
                                is_tg_mmr_fallback: settings.show_1v1_rating && !found_player?.mmr_rm_1v1,
                            };

                            // Cached player stats.
                            const player_stats = player_stats_cache[found_player.id];

                            // Cache expiration.
                            const minutes_to_save_for = 10;
                            const milliseconds_to_save_for = minutes_to_save_for * 60 * 1000;
                            const time_in_future = player_stats?.from + milliseconds_to_save_for;

                            const current_time = Date.now();

                            if (player_stats && (time_in_future >= current_time)) {
                                // Add player stats from cache.
                                players[found_player.id].wins = player_stats?.wins;
                                players[found_player.id].losses = player_stats?.losses;
                                players[found_player.id].winrate = player_stats?.winrate;
                                players[found_player.id].number_of_games = player_stats?.number_of_games;
                            } else {
                                // Add player stats.
                                const {leaderboard: player_stats} = await get_current_player(found_player.id);

                                // Initialize player stats cache.
                                player_stats_cache[found_player.id] = {
                                    from: Date.now(),
                                };

                                if (Array.isArray(player_stats) && player_stats?.length > 0) {
                                    const wins = player_stats[0].wins;
                                    const losses = player_stats[0].losses;
                                    const number_of_games = wins + losses;

                                    // Winrate.
                                    const winrate = get_winrate({wins, number_of_games});

                                    // Set player stats.
                                    players[found_player.id].wins = wins;
                                    players[found_player.id].losses = losses;
                                    players[found_player.id].winrate = winrate;
                                    players[found_player.id].number_of_games = number_of_games;

                                    // Set player stats cache.
                                    player_stats_cache[found_player.id] = {
                                        wins,
                                        losses,
                                        winrate,
                                        number_of_games,
                                        from: Date.now(),
                                    };
                                }
                            }

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

                    current_players = players;
                    match.players = current_match_players;
                    match.type = type;
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

    function get_winrate({wins, number_of_games}) {
        let winrate = (wins / number_of_games) * 100;

        // Convert float to 2 decimal.
        if (!Number.isInteger(winrate)) {
            winrate = winrate.toFixed(2);
        }

        return winrate;
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

        if (settings?.login) {
            set_websocket_data();
        } else {
            set_static_data();
            set_data();
		    start_periodic_check();
        }
	});

</script>

<div class="overlay">
    <!-- Error icon. -->
    {#if (show_error)}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="red" class="error-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
    {/if}

    {#if (current_match && Object.keys(current_match).length > 0)}

        <div class="match-info">
            <!-- Indicate queuing. -->
            {#if (current_match?.type.toLowerCase() === "queuing")}
                <svg width="19" height="19" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#fff" class="spinner"><path d="M12 1a11 11 0 1 0 11 11A11 11 0 0 0 12 1Zm0 19a8 8 0 1 1 8-8 8 8 0 0 1-8 8Z" opacity=".25"/><path d="M10.14 1.16a11 11 0 0 0-9 8.92A1.59 1.59 0 0 0 2.46 12a1.52 1.52 0 0 0 1.65-1.3 8 8 0 0 1 6.66-6.61A1.42 1.42 0 0 0 12 2.69a1.57 1.57 0 0 0-1.86-1.53Z" class="spinner-inner"/></svg>
                {current_match.type.toUpperCase()}
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
            {:else if (current_match?.game_type)}
                {current_match.game_type}
            {/if}

            <!-- Server name. -->
            {#if (current_match?.server)}
                |
                {settings.servers[current_match.server.toLowerCase()] ?? current_match.server}
            {/if}
        </div>

        {#if (current_match.players)}
            {@const is_team_game = current_match.players.length > 2}

            <div class={`players ${is_team_game ? "-team" : ""}`}>
                {#each current_match.players as player, index (player.profile_id)}
                    {@const is_another_team = (is_team_game && index > 0 && index < current_match.players.length - 1 && player.team !== current_match.players[index + 1].team)}

                    <div class={`player ${is_another_team ? "-border" : ""}`}>
                        <div class="player-civ-name-container">
                            <!-- Civ image. -->
                            {#if (settings?.civs || player?.civilization)}
                                {@const civ_image_url = `https://aoe2techtree.net/img/Civs/${settings?.civs ? settings.civs[player.civ].toLowerCase() : player.civilization.toLowerCase()}.png`}

                                <div class="player-civ">
                                    <img src={civ_image_url} class="civ-flag" width="33" height="33" alt="">
                                    {settings ?.civs ? settings.civs[player.civ] : player.civilization}
                                </div>
                            {/if}

                            <!-- Player name. -->
                            <div class="player-name-wrap">
                                {#if (current_players[player.profile_id]?.country)}
                                    <img src={`https://flagicons.lipis.dev/flags/1x1/${current_players[player.profile_id].country.toLowerCase()}.svg`} class="flag" width="20" height="20" alt={current_players[player.profile_id].country}>
                                {/if}

                                <div class="player-name-inner">
                                    <span use:fit={{min_size: 14, max_size: 26}}>{player.name}</span>
                                </div>
                            </div>
                        </div>

                        {#if (current_players[player.profile_id])}
                            <!-- Player rating. -->
                            {#if (current_players[player.profile_id]?.rating)}
                                <span class="rating">
                                    {current_players[player.profile_id].rating}

                                    <!-- Indicate TG MMR fallback -->
                                    {#if (current_players[player.profile_id]?.is_tg_mmr_fallback)}
                                        <span class="team-game-rating">TG</span>
                                    {/if}

                                    MMR
                                </span>
                            {/if}

                            <!-- Player rank. -->
                            {#if (current_players[player.profile_id]?.rank)}
                                <span class="rank">(#{current_players[player.profile_id].rank})</span>
                            {/if}

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
                            {#if (current_players[player.profile_id]?.winrate)}
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
        font-size: 19px;
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

    .player-name-wrap {
        display: flex;
        align-items: center;
        font-size: 1.2em;
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

    .rating {
        color: #D2AF26;
    }
    .team-game-rating {
        color: #00dcf3;
    }

    .rank {
        font-size: 0.85em;
    }

    .winrate {
        display: flex;
        align-items: center;
        font-size: 0.88em;
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
        color: rgb(239 68 68);
        color: rgb(237 83 83);
    }
</style>

