<script>
    import "./assets/global.css";

    import {Route, router} from "tinro";

    import Overlay from "./lib/Overlay.svelte";
    import Settings from "./lib/Settings.svelte";

    $: is_home = !(Object.keys($router.query).length);
</script>

<svelte:head>
    <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5">
    <meta name="msapplication-TileColor" content="#da532c">
    <meta name="theme-color" content="#ffffff">
</svelte:head>

<Route path="/">
    {#if (is_home)}
        <Settings />
    {:else}
        <Overlay />
    {/if}
</Route>
