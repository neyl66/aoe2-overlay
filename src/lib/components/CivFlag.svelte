<script>
    export let civ = "";
    export let size = 30;
    export let is_ror = false;

    function get_civ_url(civilization, is_ror) {
        // RoR civs adjust.
        if (is_ror) {
            switch (civilization?.toLowerCase()) {
                case "persians":
                case "romans":
                    civilization += "-ror";
                    break;
            }
        }

        return `/images/civs/${civilization?.toLowerCase()}.png`;
    }

    $: civ_image_url = get_civ_url(civ, is_ror);
</script>

<img src={civ_image_url} class="civ-flag" width={size} height={size} alt="">

<style>
    .civ-flag {
        margin-right: 4px;
    }
</style>