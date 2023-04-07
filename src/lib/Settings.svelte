<script>
    import Search from "./Search.svelte";

    import {router} from "tinro";
    import { onMount } from "svelte";

    let url_settings = {
        profile_id: "",
        use_websocket: false,
        align_right: false,
        hide_mmr_label: false,
        hide_rank_over: 1000,
    };

    let selected_player = {};
    $: if (selected_player?.profile_id) {
        url_settings.profile_id = selected_player.profile_id
    };

    $: button_disabled = !url_settings.profile_id;

    function go_to_overlay() {
        const url = new URLSearchParams();

        // Construct url.
        for (const [key, value] of Object.entries(url_settings)) {
            url.set(key, value);
        }

        router.goto(`/?${url.toString()}`);
    }

    onMount(() => {
        // Restore saved settings.
        const saved_url_settings = localStorage.getItem("url_settings");
        if (saved_url_settings) {
            url_settings = JSON.parse(saved_url_settings);
        }

        // Restore saved player.
        const saved_player = localStorage.getItem("selected_player");
        if (saved_player) {
            selected_player = JSON.parse(saved_player);
        }

        // Save data.
        return () => {
            localStorage.setItem("url_settings", JSON.stringify(url_settings));
            localStorage.setItem("selected_player", JSON.stringify(selected_player));
        }
    });

</script>

<div class="container overlay" class:-right={url_settings.align_right}>
    <h2>Settings</h2>

    <!-- Search player. -->
    <Search bind:selected_player />

    <!-- Use websocket. -->
    <label for="use-websocket">
        <input type="checkbox" id="use-websocket" bind:checked={url_settings.use_websocket}>
        Use websocket integration
    </label>

    <!-- Align right. -->
    <label for="align-right">
        <input type="checkbox" id="align-right" bind:checked={url_settings.align_right}>
        Align right
    </label>

    <!-- Align right. -->
    <label for="hide-mmr-label">
        <input type="checkbox" id="hide-mmr-label" bind:checked={url_settings.hide_mmr_label}>
        Hide "MMR" label
    </label>

    <!-- Hide rank over. -->
    <label for="hide-rank-over">
        Hide rank over
        <input type="text" id="hide-rank-over" bind:value={url_settings.hide_rank_over}>
    </label>

    <button on:click={go_to_overlay} disabled={button_disabled}>Go to overlay</button>
</div>

<style>
    .container {
        padding: 15px;
    }

    h2 {
        margin-top: 0;
        margin-bottom: 10px;
    }

    button {
        margin-top: 5px;
    }
</style>