<script>
    import {onMount} from "svelte";
    import Icon from "./components/Icon.svelte";
    import CountryFlag from "./components/CountryFlag.svelte";
    import CivFlag from "./components/CivFlag.svelte";
    import {fit} from "@leveluptuts/svelte-fit";

    import Sockette from "sockette";
    import dayjs from "dayjs";
    import {meta, router} from "tinro";
    const route = meta();

    import TTLCache from "@isaacs/ttlcache";
    const player_stats_cache = new TTLCache({
        // Cache for 15 minutes.
        ttl: 15 * 60 * 1000,
    });

    import {get_winrate} from "../utils.js";
    import {get_current_match} from "../lib/queries/matches.js";
    import {check_players, get_current_player} from "../lib/queries/players.js";

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
        use_websocket: (route.query?.k) ? true : (route.query?.use_websocket === "true"),
        show_1v1_rating: true,
        show_player_colors_before_name: true,
        use_ingame_name: true,
        align_right: route.query?.align_right === "true",
        hide_rank_over: route.query?.hide_rank_over ?? Infinity,
        hide_mmr_label: route.query?.hide_mmr_label === "true",
        hide_last_match_date: route.query?.hide_last_match_date === "true",
        show_last_match_date_over: route.query?.show_last_match_date_over ?? 30,
        hide_winrate_icon: route.query?.hide_winrate_icon === "true",
        hide_last_match_date_icon: route.query?.hide_last_match_date_icon === "true",
	};

	let current_match = {};
    let current_players = {};
    let show_error = false;

    async function set_data() {
        await set_current_match();
        if (!current_match) return console.error("Current match not found!");

        settings.leaderboard_id = current_match.leaderboardId;
        await set_current_players();
    }

    async function set_websocket_data() {

        settings.socket = new Sockette("wss://aoe2recs.com/dashboard/overlay-api/", {
            timeout: 60_000,
            maxAttempts: Infinity,
            onopen: (e) => {
                console.log("Connected!", e);
                show_error = false;

                // Set expected leaderboard ID.
                if (settings.show_1v1_rating) {
                    settings.leaderboard_id = 3;
                }

                // Send profile ID to API.
                if (settings?.profile_id) {
                    settings.socket.json({overlay: Number(settings.profile_id)});
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
                        let alt_rank;
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
                                alt_rank = player_stats.rank;
                            }
                        }

                        if (largest_rating == rating) continue;

                        current_match_players[i].is_smurf = true;
                        current_match_players[i].alt_name = alt_name;
                        current_match_players[i].alt_country = alt_country;
                        current_match_players[i].alt_rating = largest_rating;
                        current_match_players[i].alt_rating_diff = largest_rating - rating;
                        current_match_players[i].alt_rank = alt_rank;
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
                const {code, reason} = event;

                if ([1000, 1001, 1005].includes(code)) {
                    console.log("MANUAL RECONNECT!");
                    settings.socket.reconnect(event);
                }
            },
            onerror: (event) => {
                show_error = true;
                console.log("Error:", event);
                const {code, reason} = event;

                if ([1000, 1001, 1005].includes(code)) {
                    console.log("MANUAL RECONNECT!");
                    settings.socket.reconnect(event);
                }
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
    }

    async function set_current_match() {
        current_match = await get_current_match(settings.profile_id);
        if (!current_match) return console.error("Did not find current match!");

        // Make watched player always first.
        for (const team of current_match.teams) {
            team.players.sort((a, b) => {
                if (a.profileId == settings.profile_id) {
                    return -1;
                } else {
                    return 1;
                }
            });
        }

        // Get watched player team.
        let watched_player_team;
        for (const team of current_match.teams) {
            let found = false;
            for (const player of team.players) {
                if (player.profileId == settings.profile_id) {
                    watched_player_team = player.team;
                    found = true;
                    break;
                }
            }

            if (found) break;
        }

        if (!watched_player_team) return console.error("Did not find watched player team!");

        const players = [];

        // Make watched player team always first.
        for (const team of current_match.teams) {
            for (const player of team.players) {
                if (player.team === watched_player_team) {
                    player.team = 0;
                    team.teamId = 0;
                }

                player.profile_id = player.profileId;
                players.push(player);
            }
        }

        current_match.players = players;

        current_match.players.sort((a, b) => a.team - b.team);
    }

    async function set_current_players() {

        for (const {profile_id} of current_match.players) {
            const player = await get_current_player(profile_id);

            // Player check.
            if (!player) {
                console.error("Did not get current player", profile_id);
                continue;
            }

            const leaderboard = player.leaderboards.find(({leaderboardId}) => leaderboardId === settings.leaderboard_id);
            if (!leaderboard) {
                console.error("Leaderboard not found for player", profile_id);
                continue;
            }

            // Stats.
            const wins = leaderboard.wins;
			const losses = leaderboard.losses;
			const number_of_games = wins + losses;

            // Winrate.
            const winrate = get_winrate({wins, number_of_games});

            // Set new data.
            player.wins = wins;
            player.losses = losses;
            player.winrate = winrate;
            player.games = number_of_games;
            player.rating = leaderboard.rating;
            player.rank = leaderboard.rank;
            player.highest_rating = leaderboard?.maxRating;
            current_players[profile_id] = player;

            current_match.leaderboard_name = leaderboard.abbreviation;
        }
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

    onMount(() => {
        if (!settings.steam_id && !settings.profile_id) return;

        if (settings?.use_websocket) {
            set_websocket_data();
        } else {
            set_data();
		    start_periodic_check();
        }

        // Clean up.
        return () => {
            if (settings?.use_websocket) {
                settings.socket.close();
            } else {
                window.stop_periodic_check();
            }
        }
	});

    function go_back() {
        router.goto("/");
    }

</script>

<div class="overlay" class:-right={settings?.align_right}>
    <!-- Go back. -->
    <!-- svelte-ignore a11y-mouse-events-have-key-events -->
    <button class="back" on:click={go_back} on:mouseover={(event) => event.target.classList.add("-no-animation")}>
        <Icon type="settings" width={30} height={30} />
    </button>

    <!-- Error icon. -->
    {#if (show_error)}
        <Icon type="error" width={30} height={30} color={"red"} />
    {/if}

    {#if (current_match && Object.keys(current_match).length > 0)}
        {@const lobby_name = (current_match?.name && current_match.name !== "AUTOMATCH") ? current_match.name : current_match?.lobby_name}
        {@const map_name = current_match?.mapName && !current_match.mapName.includes("unknown") ? current_match.mapName : (!current_match?.mapName) ? current_match?.map : ""}

        <div class="match-info">
            <!-- Lobby name. -->
            {#if (lobby_name)}
                <strong>{lobby_name}</strong>
                <br>
            {/if}

            <!-- Indicate queuing. -->
            {#if (settings?.player?.status?.toLowerCase() === "queuing")}
                <Icon type="spinner" width={19} height={19} />
                {settings.player.status.toUpperCase()}
                |
            {/if}

            <!-- Map type. -->
            {#if (map_name)}
                {map_name}
                |
            {/if}

            <!-- Game type. -->
            {#if (current_match?.leaderboard_name)}
                {current_match.leaderboard_name}
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
                            {#if (player?.civName || player?.civilization)}
                                {@const civ_name = player?.civName || player?.civilization}

                                <div class="player-civ">
                                    <CivFlag
                                        civ={civ_name}
                                        size={(!is_team_game) ? 30 : 25}
                                        is_ror={current_match?.ror}
                                    />
                                    <span class="player-civ-name">{civ_name}</span>

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
                                    <CountryFlag country={current_players[player.profile_id].country} />
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
                                        <CountryFlag country={player.alt_country} />
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
                                        <span class="rating-diff">(🠕{player.alt_rating_diff})</span>
                                    {:else}
                                        {current_players[player.profile_id].rating}
                                    {/if}

                                    <!-- Highest rating. -->
                                    {#if (!player?.is_smurf && current_players[player.profile_id]?.highest_rating && (current_players[player.profile_id]?.highest_rating > current_players[player.profile_id].rating))}
                                        <span class="highest-rating">[{current_players[player.profile_id].highest_rating}]</span>
                                    {/if}

                                    <!-- Indicate TG MMR fallback -->
                                    {#if (current_players[player.profile_id]?.is_tg_mmr_fallback)}
                                        <span class="team-game-rating">TG</span>
                                    {/if}

                                    <!-- MMR label. -->
                                    {#if (!settings.hide_mmr_label)}
                                        <span class="rating-mmr">MMR</span>
                                    {/if}
                                </span>
                            {/if}

                            <!-- Player rank. -->
                            {#if (current_players[player.profile_id]?.rank && current_players[player.profile_id]?.rank > 0) || (player?.alt_rank > 0)}
                                {@const rank = (player?.alt_rank > 0) ? player.alt_rank : current_players[player.profile_id].rank}

                                {#if (rank <= settings.hide_rank_over)}
                                    <span class="rank">(#{rank})</span>
                                {/if}
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

                            <div class="winrate-last-match-data-container">
                                <!-- Player winrate. -->
                                {#if (current_players[player.profile_id]?.winrate && !isNaN(current_players[player.profile_id]?.winrate))}
                                    <span>{current_players[player.profile_id].winrate}%</span>

                                    <!-- Winrate icon. -->
                                    {#if (!settings.hide_winrate_icon)}
                                        <Icon type="winrate" />
                                    {/if}
                                {/if}

                                <!-- Player last match date. -->
                                {#if !(settings.hide_last_match_date) && (current_players[player.profile_id]?.last_match_date || current_players[player.profile_id]?.last_match)}
                                    {@const now = dayjs()}
                                    {@const last_match_date = dayjs((current_players[player.profile_id]?.last_match_date || current_players[player.profile_id]?.last_match) * 1000)}
                                    {@const last_match_days_ago = Math.round(now.diff(last_match_date, "day", true))}

                                    {#if (last_match_days_ago > settings.show_last_match_date_over)}
                                        {@const last_match_date_formatted = (last_match_days_ago < 30) ? `${last_match_days_ago}d` : (last_match_days_ago < 360) ? `${Math.round(last_match_days_ago / 30)}m` : `${Math.round(last_match_days_ago / 360)}y`}
                                        <span class="last-match-date">{last_match_date_formatted}</span>

                                        <!-- Last match date icon. -->
                                        {#if (!settings.hide_last_match_date_icon)}
                                            <Icon type="last-match-date" />
                                        {/if}
                                    {/if}
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

	{/if}
</div>

<style>
    :global(.overlay) {
        position: relative;
        width: 420px;
        background: linear-gradient(90deg, rgba(51,51,51,1) 0%, rgba(51,51,51,1) 100%);
        padding: 10px;
    }
    :global(.overlay.-right) {
        margin-left: auto;
    }
    .overlay:empty {
        padding: 0;
    }

    .back {
        background: none;
        border: none;
        position: absolute;
        top: 0;
        left: 0;
        z-index: 500;
        padding: 0.5em;
        cursor: pointer;
        transition: all .5s;
    }
    .back:hover {
        opacity: 1 !important;
    }
    .back :global(.settings-icon) {
        display: block;
        transition: all .35s;
    }
    .back:hover :global(.settings-icon) {
        fill: rgba(255, 255, 255, 0.1);
    }
    .back:not(.-no-animation) {
        animation: hide 1s forwards 1s;
    }
    .back.-no-animation {
        opacity: 0;
    }

    @keyframes hide {
        to {
            opacity: 0;
        }
    }

    .match-info {
        font-size: 18px;
        text-align: center;
        margin-bottom: 10px;
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

    .player-name-inner {
        max-width: calc(100% - 20px - 7px);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .player :global(.country-flag) {
        margin-right: 7px;
    }
    .smurf-icon {
        margin-right: 7px;
    }
    :global(.country-flag) + .smurf-icon {
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
    .highest-rating {
        color: #e5c623;
        font-size: 0.95em;
    }
    .team-game-rating {
        color: #00dcf3;
    }

    .rating-diff {
        font-size: 0.8em;
    }

    .rank {
        font-size: 0.8em;
    }
    .players.-team .rank {
        font-size: 0.75em;
    }

    .winrate-last-match-data-container {
        display: flex;
        align-items: center;
        font-size: 0.88em;
        column-gap: 5px;
    }
    .players.-team .winrate-last-match-data-container {
        font-size: 0.8em;
    }
    .players.-team .winrate-last-match-data-container {
        display: inline-flex;
    }

    .last-match-date {
        color: #f3b543;
        color: white;
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

