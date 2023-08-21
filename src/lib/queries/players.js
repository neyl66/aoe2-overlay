
export async function check_players(profile_ids) {
    if (!Array.isArray(profile_ids) || profile_ids?.length < 1) return {};

    let url = `https://aoe2-api.neyl.dev/v0/check-players?profile_ids=${profile_ids.join(",")}`;

    if (location.hostname === "localhost") {
        url = `http://localhost:8888/v0/check-players?profile_ids=${profile_ids.join(",")}`;
    }

    const response = await fetch(url).catch((error) => {
        console.error("Check players fetch error:", error);
    });

    if (!response?.ok) {
        console.error(`Check players response not ok! Status: ${response?.status}`);
        return {};
    }

    const json = await response.json();
    return json;
}

export async function get_current_player(profile_id) {
    if (!profile_id) return null;

    const response = await fetch(`https://data.aoe2companion.com/api/profiles/${profile_id}`).catch((error) => {
        console.error("Get current player fetch error:", error);
    });

    if (!response?.ok) {
        console.error(`Get current player response not ok! Status: ${response?.status}`);
        return null;
    }

    const json = await response.json();
    return json;
}
