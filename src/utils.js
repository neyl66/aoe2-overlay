
export function get_winrate({wins, number_of_games}) {
    let winrate = (wins / number_of_games) * 100;

    // Convert float to 2 decimal.
    if (!Number.isInteger(winrate)) {
        winrate = winrate.toFixed(2);
    }

    return winrate;
}
