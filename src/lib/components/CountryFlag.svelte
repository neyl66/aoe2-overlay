<script>
    export let country;
    export let circle = true;
    export let ratio = "1x1";
    export let width = 20;
    export let height = 20;
</script>

{#if (country)}
    <img src={`https://flagicons.lipis.dev/flags/${ratio}/${country.toLowerCase()}.svg`} class="country-flag" class:-circle={circle} {width} {height} alt={country}>
{/if}

<style>
    .country-flag {
        display: inline-block;
    }

    .country-flag.-circle {
        border-radius: 50%;
    }
</style>