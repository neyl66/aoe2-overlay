<script>
    import {onMount} from "svelte";
    import {meta} from "tinro";
    const route = meta();

    const player_url = (profile_id, leaderboard_id) => `https://legacy.aoe2companion.com/api/leaderboard?game=aoe2de&leaderboard_id=${leaderboard_id}&count=1&profile_id=${profile_id}`;
    const match_url = (profile_id) => `https://legacy.aoe2companion.com/api/player/matches?game=aoe2de&start=0&count=1&profile_ids=${profile_id}`;
    
	let settings = {
		steam_id: route.query?.steam_id,
        profile_id: route.query?.profile_id,
        periodic_check: {
            timer: 0,
            interval: 30 * 1000,
        },
	};

	let current_match = {};
    let current_players = {};

    async function set_static_data() {
        const response = await fetch("https://app.aoe2companion.com/static/media/en.json.679e7d39.lazy");
        const {civ, game_type, leaderboard, map_size, map_type, rating_type} = await response.json();

        const prepare_data = (data) => data.reduce((data, item) => {
            data[item.id] = item.string;
            return data;
        }, {});

        // Set static data.
        settings["civ"] = prepare_data(civ);
        settings["game_type"] = prepare_data(game_type);
        settings["leaderboard"] = prepare_data(leaderboard);
        settings["map_size"] = prepare_data(map_size);
        settings["map_type"] = prepare_data(map_type);
        settings["rating_type"] = prepare_data(rating_type);
    }

    async function set_data() {
        await set_current_match();
        settings.leaderboard_id = current_match.leaderboard_id;
        await set_current_players();
    }

    async function set_current_match() {
        [current_match] = await get_current_match();

        // Make watched player always first.
        current_match.players.sort((a, b) => {
            if (a.profile_id == settings.profile_id) {
                return -1;
            } else {
                return 1;
            }
        });
    }

    async function get_current_match() {
        const response = await fetch(match_url(settings.profile_id));
        const json = await response.json();

        return json;
    }

    async function set_current_players() {

        for (const {profile_id} of current_match.players) {
            const {leaderboard: player} = await get_current_player(profile_id);

            // Calculate winrate.
            const wins = player[0].wins;
			const losses = player[0].losses;
			const number_of_games = wins + losses;
			let winrate = (wins / number_of_games) * 100;

            // Convert float to 2 decimal.
            if (!Number.isInteger(winrate)) {
                winrate = winrate.toFixed(2);
            }

            player[0].winrate = winrate;

            current_players[player[0].profile_id] = player[0];
        }
    }

    async function get_current_player(profile_id) {
        const response = await fetch(player_url(profile_id, settings.leaderboard_id));
        const json = await response.json();

        return json;
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

        set_static_data();
        set_data();
		start_periodic_check();
	});

</script>

<main class="overlay">
    {#if (Object.keys(current_match).length > 0) }

        <div class="match-info">
            {#if (settings?.map_type) }
                Map: {settings.map_type[current_match.map_type]}
                |
            {/if}

            Server: {current_match.server}
        </div>

        {#if current_match.players}
            <div class="teams">
                <div class="team">
                    {#each current_match.players as player}
                        <div class="player">
                            {#if (settings?.civ) }
                                <img src={`https://aoe2techtree.net/img/Civs/${settings.civ[player.civ].toLowerCase()}.png`} class="civ-flag" width="30" height="30" alt={settings.civ[player.civ]}>
                            {/if}

                            {player.name}

                            {#if current_players[player.profile_id]?.country}
                                <img src={`https://flagicons.lipis.dev/flags/1x1/${current_players[player.profile_id].country.toLowerCase()}.svg`} class="flag" width="20" height="20" alt={current_players[player.profile_id].country}>    
                            {/if}

                            |

                            {#if (current_players[player.profile_id]) }
                                <span class="rating">{current_players[player.profile_id].rating} rating </span>

                                (#{current_players[player.profile_id].rank})

                                |
                                {current_players[player.profile_id].winrate}%
                                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" class="winrate-icon"><path fill="#fff" d="M5 0c0 9.803 5.105 12.053 5.604 16h2.805c.497-3.947 5.591-6.197 5.591-16h-14zm7.006 14.62c-.408-.998-.969-1.959-1.548-2.953-1.422-2.438-3.011-5.162-3.379-9.667h9.842c-.368 4.506-1.953 7.23-3.372 9.669-.577.993-1.136 1.954-1.543 2.951zm-.006-3.073c-1.125-2.563-1.849-5.599-1.857-8.547h-1.383c.374 3.118 1.857 7.023 3.24 8.547zm12-9.547c-.372 4.105-2.808 8.091-6.873 9.438.297-.552.596-1.145.882-1.783 2.915-1.521 4.037-4.25 4.464-6.251h-2.688c.059-.45.103-.922.139-1.405h4.076zm-24 0c.372 4.105 2.808 8.091 6.873 9.438-.297-.552-.596-1.145-.882-1.783-2.915-1.521-4.037-4.25-4.464-6.251h2.688c-.058-.449-.102-.922-.138-1.404h-4.077zm13.438 15h-2.866c-.202 1.187-1.63 2.619-3.571 2.619v4.381h10v-4.381c-1.999 0-3.371-1.432-3.563-2.619zm2.562 6h-8v-2h8v2z"></path></svg>
                                |

                                <span class="win">{current_players[player.profile_id].wins}W</span>
                                &nbsp;
                                <span class="loss">{current_players[player.profile_id].losses}L</span>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

	{/if}
</main>

<style>
    .overlay {
        font-size: 22px;
        text-shadow: black 0px 0px 3px;
    }

    .match-info {
        margin-bottom: 10px;
    }

    .team {
        margin-bottom: 8px;
    }

    .player {
        display: flex;
        align-items: center;
        white-space: nowrap;
        margin-bottom: 5px;
    }

    .civ-flag {
        margin-right: 5px;
    }

    .flag {
        border-radius: 50%;
        margin: 0 5px;
    }

    .rating {
        color: rgb(175 148 78);
        color: #D2AF26;
        margin-left: 5px;
        margin-right: 5px;
    }

    .winrate-icon {
        margin-left: 5px;
        margin-right: 5px;
    }

    .win {
        color: rgb(34 197 94);
        margin-left: 5px;
    }

    .loss {
        color: rgb(239 68 68);
    }
</style>

