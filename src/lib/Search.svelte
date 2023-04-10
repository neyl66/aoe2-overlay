<script>
    import CountryFlag from "./components/CountryFlag.svelte";

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

</script>

<div class="search">
    Player
    <AutoComplete searchFunction={search_players} bind:selectedItem={selected_player} labelFieldName="name" maxItemsToShowInList={10} delay={250} localFiltering={false} showLoadingIndicator={true} placeholder="search players">
        <div class="player-dropdown" slot="item" let:item={player} let:label={label}>
            <CountryFlag country={player.country} circle={false} ratio={"4x3"} height={15} />
            <span>{@html label}</span>
        </div>
    </AutoComplete>
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

    .search .player-dropdown {
        display: flex;
        align-items: center;
        column-gap: 8px;
    }
    .search :global(.country-flag) {
        outline: 1px solid #e9ecef;
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