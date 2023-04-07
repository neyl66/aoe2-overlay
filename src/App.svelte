<script>
    import "./assets/global.css";

    import {onMount} from "svelte";

    import {Route, router} from "tinro";

    import Overlay from "./lib/Overlay.svelte";
    import Settings from "./lib/Settings.svelte";

    $: is_home = !(Object.keys($router.query).length);

    function initialize_local_url_settings() {
        // Empty query check.
        if (Object.keys($router?.query)?.length < 1) return;

        // Initialize local url settings.
        if (!localStorage.getItem("url_settings")) {
            const url_settings = Object.entries($router.query).reduce((settings, [key, value]) => {
                if (["true", "false"].includes(value.toLowerCase())) {
                    settings[key] = value.toLowerCase() === "true";
                } else {
                    settings[key] = value;
                }

                return settings;
            }, {});

            localStorage.setItem("url_settings", JSON.stringify(url_settings));
        }
    }

    function apply_local_url_settings() {
        let url_settings = localStorage.getItem("url_settings");
        if (!url_settings) return;

        url_settings = JSON.parse(url_settings);

        // Update url.
        for (const [key, value] of Object.entries(url_settings)) {
            router.location.query.set(key, `${value}`)
        }
    }

    onMount(initialize_local_url_settings);
    apply_local_url_settings();

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
