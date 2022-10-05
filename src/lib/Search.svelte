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

</script>

<input type="text" placeholder="search players" bind:value={search_value} on:input={search_players}>

{#if (found_players.length > 0) }
    <div class="found-players">
        {#each found_players as player}
            <div class="player">
                <a href="/?profile_id={player.profile_id}">{player.name}</a>
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