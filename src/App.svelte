<script>
    import "./assets/global.css";

    import {Route, router} from "tinro";

    import Overlay from "./lib/Overlay.svelte";
    import Search from "./lib/Search.svelte";

    $: is_search = !(Object.keys($router.query).length);
</script>

<Route path="/">
    {#if (is_search)}
        <Search />
    {:else}
        <Overlay />
    {/if}
</Route>

<style>

</style>
