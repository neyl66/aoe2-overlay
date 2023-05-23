<script>
    export let civ = "";
    export let size = 30;
    export let is_ror = false;

    // RoR civs adjust.
    if (is_ror) {
        switch (civ?.toLowerCase()) {
            case "persians":
            case "romans":
                civ += "-ror";
                break;
        }
    }

    const civ_image_url = `/images/civs/${civ?.toLowerCase()}.png`;
</script>

<img src={civ_image_url} class="civ-flag" width={size} height={size} alt="">

<style>
    .civ-flag {
        margin-right: 4px;
    }
</style>