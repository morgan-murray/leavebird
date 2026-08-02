const panel = (id, caption, alt) => ({
  id,
  image: "/daily-chirp/panel-" + String(id).padStart(2, "0") + ".webp",
  caption,
  alt,
});

export const dailyChirps = [
  panel(1, "Today’s timesheet was brought to you by selective memory.", "Leavebird tries to remember the day while laptop, tea and question-mark thoughts float overhead."),
  panel(2, "Logged eight hours. Emotionally, it was Thursday.", "An exhausted Leavebird slumps at a laptop among empty tea mugs."),
  panel(3, "Your hours are submitted. Please return to planning your escape.", "Leavebird closes the timesheet and eagerly opens a weekend map."),
  panel(4, "Time logged. Weekend mode is one step closer.", "Leavebird hops across office-paper stepping stones towards a sunny picnic."),
  panel(5, "Another day successfully converted into numbers.", "Leavebird feeds a ribbon of workday scenes into a cheerful adding machine."),
  panel(6, "You worked it. We clocked it. Now go live it.", "Leavebird taps the time clock while heading for a sunny doorway with a backpack."),
  panel(7, "Your future self thanks you for filling this in today.", "Today’s Leavebird high-fives a future Leavebird relaxing in a deckchair."),
  panel(8, "Timesheet complete. That deserves at least one biscuit.", "Leavebird proudly holds a biscuit like a gold medal beside a finished timesheet."),
  panel(9, "Today’s hours are safely back in their nest.", "Leavebird tucks tiny clock-shaped hours into a cosy nest."),
  panel(10, "Work recorded. Freedom pending.", "Leavebird stands at an open cage door, held back by one last paperclip."),
  panel(11, "Look at you, remembering what you did today.", "Leavebird follows workday memory clues with a magnifying glass."),
  panel(12, "Another timesheet mystery successfully solved.", "Detective Leavebird examines the completed timesheet and its clues."),
  panel(13, "Hours entered. Productivity officially documented.", "Leavebird ceremoniously stamps a tidy sheet with a coral checkmark."),
  panel(14, "You came. You worked. You remembered your lunch break.", "Leavebird happily holds a sandwich between a laptop and lunchbox."),
  panel(15, "Today has been filed under ‘Things I Definitely Accomplished.’", "Leavebird proudly files the completed day in a trophy-marked cabinet."),
  panel(16, "Your time has been logged with suspicious efficiency.", "Leavebird speed-types beside a stopwatch while looking comically innocent."),
  panel(17, "Congratulations! Today now has an audit trail.", "Leavebird follows a neat trail of paper footprints and checkmarks."),
  panel(18, "One small click for you, one giant leap towards Friday.", "Astronaut Leavebird leaps from the desk towards a glowing weekend landscape."),
  panel(19, "Hours safely stored. Kettle permission granted.", "Leavebird salutes a steaming kettle beside the finished timesheet."),
  panel(20, "Today’s work is now somebody else’s spreadsheet problem.", "Leavebird launches a grid-paper aeroplane towards a distant office."),
  panel(21, "Nothing says ‘professional’ like remembering your hours.", "Leavebird poses formally in a tie and spectacles with a pristine clipboard."),
  panel(22, "Timesheet done. Cape optional.", "Superhero Leavebird stands on a closed laptop with a checked clipboard."),
  panel(23, "The numbers add up—even if the day didn’t.", "Leavebird balances tidy tokens while the office leans at crooked angles."),
  panel(24, "Your working day has officially landed.", "Air-traffic-controller Leavebird guides a clock-shaped aircraft onto a timesheet runway."),
  panel(25, "Another eight-ish hours accounted for.", "Leavebird measures a comically stretchy timeline between two clocks."),
  panel(26, "Work–life balance begins with closing this tab.", "Leavebird balances a laptop and picnic basket, then gently closes the laptop."),
  panel(27, "You’ve earned the right to stop thinking about timesheets.", "Leavebird relaxes with tea while a timesheet thought cloud fades away."),
  panel(28, "Your hours have been successfully domesticated.", "Leavebird herds tiny clock-shaped chicks into a cosy pen."),
  panel(29, "That’s today sorted. Tomorrow can wait.", "Leavebird closes the door on tomorrow and settles into an evening chair."),
  panel(30, "You remembered your break. Your sandwich would be proud.", "A proud sandwich presents Leavebird with a ribbon beside the lunchbox."),
  panel(31, "Time flies. Fortunately, Leavebird keeps the receipts.", "Leavebird chases winged clocks while holding their curling receipt trail."),
  panel(32, "Your hours are logged and ready to leave the nest.", "Leavebird watches clock-shaped chicks fly from their nest towards sunrise."),
  panel(33, "Another day closer to your next adventure.", "Leavebird moves a game piece along a map from the office towards the coast."),
  panel(34, "Timesheet complete. Commence looking busy elsewhere.", "Leavebird spins in an office chair while holding an impressively empty folder."),
  panel(35, "Your work here is done—at least administratively.", "Leavebird raises both wings beside an enormous checked clipboard."),
  panel(36, "Today’s effort has been translated into decimal form.", "Leavebird feeds workday scenes into a machine that produces tidy coloured dots."),
  panel(37, "Hours entered. Weekend plotting may now resume.", "Leavebird studies a secret weekend map of activities with a magnifying glass."),
  panel(38, "No hours were harmed while completing this timesheet.", "Leavebird supervises cheerful clock characters wearing safety helmets."),
  panel(39, "The clock has spoken, and we wrote it down.", "Leavebird takes careful notes while listening to a grandfather clock."),
  panel(40, "A tidy timesheet is a tiny workplace miracle.", "Leavebird gazes at a perfectly tidy timesheet glowing above the desk."),
  panel(41, "That satisfying moment when every hour has somewhere to be.", "Leavebird sorts little clock tokens into seven perfectly neat cubbyholes."),
  panel(42, "Your day is logged. Your evening remains gloriously untracked.", "Leavebird leaves the office clock behind and walks into a starry evening."),
  panel(43, "Another deadline defeated by remembering things.", "Knight Leavebird stands victorious over a cardboard calendar dragon."),
  panel(44, "You’ve clocked off from clocking on.", "Leavebird switches off a wall clock and heads for the door with a weekend bag."),
  panel(45, "Work recorded. Adventures loading.", "Leavebird waits with a backpack as progress dots lead towards hills and city lights."),
  panel(46, "Your hours have passed quality control. Probably.", "Inspector Leavebird examines the timesheet and gives an uncertain shrug."),
  panel(47, "The timesheet gremlins have been fed for another day.", "Leavebird feeds clock biscuits to friendly paper gremlins in a desk drawer."),
  panel(48, "Today: completed. Hours: captured. Mood: improving.", "Leavebird walks from a rainy workday towards a warm and cheerful sun."),
  panel(49, "Time well spent—or at least well documented.", "Leavebird proudly assembles a scrapbook of workday moments."),
  panel(50, "Your timesheet is complete. Please accept this imaginary sticker.", "Leavebird beams while wearing an oversized mustard star sticker."),
  panel(51, "The admin is done. Release the weekend plans!", "Leavebird opens a box bursting with picnic, theatre, cycling and beach plans."),
  panel(52, "Today’s numbers are tomorrow’s ‘I definitely worked that day.’", "Leavebird takes an instant proof photo beside a completed timesheet and clock."),
  panel(53, "Hours logged. Inbox not included.", "Leavebird boxes the clock tokens while unopened envelopes pile up behind."),
  panel(54, "You’ve successfully turned a long day into a short entry.", "Leavebird compresses a long ribbon of workday scenes into one small card."),
  panel(55, "Another day neatly tucked into the calendar.", "Leavebird tucks a sleepy little sun into a calendar square."),
  panel(56, "Timesheet finished. Go and do something less spreadsheet-shaped.", "Leavebird leaves a rigid grid maze for a park of curved paths and trees."),
  panel(57, "Your hours are in. Your holiday countdown continues.", "Leavebird hops along clock-shaped stepping stones towards a bright suitcase."),
  panel(58, "Work captured. Breaks respected. Bird pleased.", "Leavebird catches a friendly clock, then enjoys tea on a break bench."),
  panel(59, "Today is officially off your to-do list.", "Leavebird finishes an enormous checkmark and tosses the pencil with delight."),
  panel(60, "All logged! Now spread your wings and clock off.", "Leavebird flies from the closed laptop and clock towards a glowing sunset."),
];

export function dailyChirpIndex(date = new Date()) {
  const localDayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return ((localDayNumber % dailyChirps.length) + dailyChirps.length) % dailyChirps.length;
}

export function dailyChirpForDate(date = new Date()) {
  return dailyChirps[dailyChirpIndex(date)];
}

export function dailyChirpDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function dailyChirpDismissalKey(date = new Date()) {
  return "leavebird-daily-chirp-dismissed-" + dailyChirpDateKey(date);
}
