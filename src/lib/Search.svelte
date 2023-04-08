<script>
    import AutoComplete from "simple-svelte-autocomplete";

    export let selected_player;

    const search_cache = {};

    async function search_players(search_value) {
        if (!search_value) return [];

        if (search_cache[search_value]) return search_cache[search_value];

        const search_url = (search) => `https://legacy.aoe2companion.com/api/profile?game=aoe2de&start=1&count=10&search=${encodeURIComponent(search)}`;

        const response = await fetch(search_url(search_value)).catch((error) => console.error("Search players fetch error!", error));

        if (!response?.ok) {
            console.error(`Search players fetch not ok! Status: ${response?.status}`);
            return [];
        }

        const json = await response.json();

        const {profiles} = json;

        search_cache[search_value] = profiles;

        return profiles;
    }

    function search_label(player) {
        if (!player?.country) return player.name;
        return `[${player.country}] ${player.name}`;
    }

</script>

<div class="search">
    Player
    <AutoComplete searchFunction={search_players} bind:selectedItem={selected_player} labelFunction={search_label} maxItemsToShowInList={10} delay={250} localFiltering={false} showLoadingIndicator={true} placeholder="search players" />
</div>

<style>
    .search {
        margin-bottom: 0.5em;
    }

    .search :global(.autocomplete) {
        vertical-align: middle;
    }

    .search :global(.autocomplete-input) {
        padding: 0.4em;
        padding-right: 2em;
        margin-bottom: 0;
    }

    .search :global(.select.is-loading::after) {
        content: "";
        height: 1em;
        width: 1em;
        border: 2px solid #dbdbdb;
        border-radius: 50%;
        border-right-color: transparent;
        border-top-color: transparent;
        animation: spin 500ms infinite linear;
        position: absolute;
        right: 0.625em;
        top: 0.5em;
    }

    .search :global(.autocomplete-list-item-loading) {
        color: #333;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(359deg);
        }
    }
</style>