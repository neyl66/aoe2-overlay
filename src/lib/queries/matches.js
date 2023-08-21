
export async function get_current_match(profile_id) {
    if (!profile_id) return null;

    const response = await fetch(`https://data.aoe2companion.com/api/matches?profile_ids=${profile_id}`).catch((error) => {
        console.error("Get matches fetch error:", error);
    });

    if (!response?.ok) {
        console.error(`Get matches response not ok! Status: ${response?.status}`);
        return null;
    }

    const json = await response.json();

    const {matches} = json;

    if (Array.isArray(matches) || matches?.length > 0) {
        return matches[0];
    }

    return null;
}
