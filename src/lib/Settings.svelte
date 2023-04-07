<script>
    import Search from "./Search.svelte";

    import {router} from "tinro";

    let selected_player = {};
    let use_websocket = false;
    let align_right = false;
    $: button_disabled = !selected_player?.profile_id;

    function go_to_overlay() {
        const url = new URLSearchParams();
        url.set("profile_id", selected_player.profile_id);
        url.set("use_websocket", use_websocket);
        url.set("align_right", align_right);

        router.goto(`/?${url.toString()}`);
    }
</script>

<div class="container">
    <h2>Settings</h2>

    <!-- Search player. -->
    <Search bind:selected_player />

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