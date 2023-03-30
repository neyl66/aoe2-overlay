<script>
    const search_url = (search) => `https://legacy.aoe2companion.com/api/profile?game=aoe2de&start=1&count=10&search=${search}`;

    let found_players = [];
    let search_value = "";

    const search_players = debounce(async (event) => {
        if (!search_value) return;

        const response = await fetch(search_url(search_value));
        if (!response.ok) return;

        const json = await response.json();

        found_players = json.profiles;

    }, 250);

    function debounce(callback, wait) {
        let timeout_id = null;
        return (...args) => {
            window.clearTimeout(timeout_id);
            timeout_id = window.setTimeout(() => {
                callback.apply(null, args);
            }, wait);
        };
    }

    let use_websocket = false;
    let align_right = false;
</script>

<input type="text" placeholder="search players" bind:value={search_value} on:input={search_players}>

<!-- Use websocket. -->
<label for="use-websocket">
    <input type="checkbox" id="use-websocket" bind:checked={use_websocket}>
    Use websocket integration
</label>

<!-- Align right. -->
<label for="align-right">
    <input type="checkbox" id="align-right" bind:checked={align_right}>
    Align right
</label>

{#if (found_players.length > 0) }
    <div class="found-players">
        {#each found_players as player}
            <div class="player">
                <a href="/?profile_id={player.profile_id}&use_websocket={use_websocket}&align_right={align_right}">{player.name}</a>
            </div>
        {/each}
    </div>
{/if}

<style>
    .player a {
        color: #fff;
        text-decoration: underline;
    }
</style>