# Goldito data anonymization and privacy guide (Q.3)

> [!IMPORTANT]
> **Required reading for AI agents (Strict Anonymization Rules)**  
> 1. This document is the source-of-truth rule set for AI agents that anonymize data.
> 2. **Hard rule for writing docs (Zero-Leakage):** **Never write real personal data (real people's names, animal names, phone numbers, addresses, postal codes, door lock numbers, specific shop names, place names, and so on) in any document or commit message, not even as an example**, and that includes this guideline document itself. Every example and explanation must use only fully generalized, abstract dummy notation (`[City]`, `[Shop]`, `[Postal Code]`, `XXg`, `N pcs`, and so on).
> 3. **Block at the source, and replacement priority:**
>    * **Replace ranges and combined expressions first:** Replace compound range expressions (`the [Ordinal] to the [Ordinal]`, `[Time]-[Time]`, `N-N pooping per day`, `free anytime N-N`) and address + postal code combinations (`{ADDRESS} [Postal Code]` and so on) before single words, so leftover fragment bugs can never happen.
>    * **Fully mask every daily-life, body, and food number:** Replace every concrete quantity, count, and unit expression in the text with its placeholder, missing none: food pack counts (`N pack`), potty and walk counts (`N-N pooping per day`, `N walks`), treat amounts (`for N [item]`), nights of stay (`Nnights`, `N nights`), compound feeding amounts (`Nx N/N`, `Nx N/N teaspoon`), and so on.
>    * **Replace every ordinal and combined date:** Standalone ordinals with no month (`[Ordinal]`) and combined dates (`{DATE} or N`, `from {DATE}-N`) also become `{DATE}`, 100%.

---

## 1. Core principles

1. **Keep the tone, mask 100% of identifying data and detailed numbers:**
   * Keep the sitter's own tone (welcome greetings, caring phrases, the way they describe the pet's state, emoji habits), but mask every clue that can identify a specific person, place, or subject, or pin down a unique routine: people's names, real animal names, breeds, contact details, addresses, postal codes, entry and door lock key data, places visited and shop names, specific countries, cities, and parks, transit lines and station names, specific vet clinic names, external links, scheduled times and travel times, diet and package units, potty and walk frequency numbers, specific numbers of nights or years, and so on.
2. **Repository (Git) security rule:**
   * Original data that holds real personal data is **never committed to the Git repository**.
   * Repository docs and commits **never write proper names taken from real data, not even as examples, and use only generalized dummy notation**.
3. **Pass a full check of 20 random samples (DoD):**
   * The work counts as done only when a person checks 20 random samples of the converted data and finds 0 personal data (PII) leaks.

---

## 2. Placeholder and cleaning rules

These are the masking rules an agent applies when it processes text (for example chat logs or messenger export files).

### 2.1 Main placeholders

| Type | Placeholder | What to replace (patterns) | Example (abstract dummy) |
| :--- | :--- | :--- | :--- |
| **Price/fee** | `{PRICE}` | Every currency symbol, numeric amount, and currency unit | `$XX`, `$XX CAD`, `XX dollars` |
| **Date/schedule** | `{DATE}` | Weekdays, month/day, date ranges, ordinals, year-month-day, standalone days or ordinals with no month, standalone days joined by a conjunction (`{DATE} or N`, `from {DATE}-N`, `{DATE} to N`) | A specific weekday, a specific date, a date range, a standalone ordinal day, a combined day |
| **Time/duration** | `{TIME}` | Hour:minute, am/pm, 3 to 4 digit times with no colon (`NNN`, `NNNN`), o'clock or spoken forms combined (`between N o’clock and NNN`), time ranges with no am/pm (`N-N`, `NN-N`), minutes written with no space (`in Nminute`, `in NNminute`), arrival in N minutes (ETA) | `XXam`, `XX:XXpm`, `X-X`, `between {TIME}`, `in {TIME}` |
| **Quantity/diet/unit** | `{AMOUNT}` | Food weight (g, kg), piece counts (pcs), package units (`N pack`, `N cans`), food/item/treat counts (`for N [item]`), message/update/photo counts (`N-N updates`, `N updates`), counts of things (`these N trips`), stops or deliveries left (`N stops left`), spoon/pump measures (`N teaspoon`, `N pumps`), multiplier prefixes (`Nx`), fractions and decimals (`N/N`, `N.N`) | `XXg`, `Xpcs`, `{AMOUNT}`, `{AMOUNT} updates`, `these {AMOUNT} trips`, `{AMOUNT} stops`, `{AMOUNT} [unit]` |
| **Frequency/count** | `{FREQUENCY}` | Daily or weekly activity and body frequency (`N-N pooping per day`, `meals Nx a day`, `walks Nx a day`, `all N meals`, `N meals per day`, `N times a day`, `pee N times`) | `{FREQUENCY}`, `all {FREQUENCY} meals`, `meals {FREQUENCY}`, `walks {FREQUENCY}` |
| **Stay/experience/duration** | `{DURATION}` | Length of stay, nights or days of stay, walk or outing duration (`Walks take NN to {TIME}` → `take {DURATION}`), years of experience or time spans (`Nnights`, `N nights`, `over N years`, `N years already`, `N yrs old`) | `{DURATION}`, `take {DURATION}`, `Xnights`, `over {DURATION}` |
| **Breed** | `{BREED}` | Specific pet breed names (`[Breed A]`, `[Breed B]`, and so on) | `{BREED}`, `this breed` |
| **Country/city/region** | `{LOCATION}` | Specific country names, city names, travel destinations, country of origin, and related nationality adjectives | Any `[Country]`, `[City]`, `[Foreign Region]` |
| **Phone number** | `{PHONE}` | Every phone number format, including country and area codes | 10 to 11 digit numbers, with hyphens or parentheses |
| **Email** | `{EMAIL}` | Every email address | Mail addresses with `@` and a domain |
| **Address/location/place** | `{ADDRESS}` | Street addresses, apartment building and unit numbers (`#NNN`, `unit NNNN`), **postal codes (every country's format)**, park and conservation area names, specific vet clinic names, subway and train station names, bus stops, specific cafe, shop, and chain names | Street names, specific vet clinics, station names, park names, any postal code |
| **Web link/URL** | `{URL}` | Every external link: YouTube, Google Maps, websites, online shops, and so on | Any `https://...`, `http://...` address |
| **Entry/security** | `{CODE}` | Apartment buzzer numbers (Buzzer code), door phone key codes (N digits and so on), door lock passwords, key box codes | `Buzzer: {CODE}`, `Key code: {CODE}`, `Key {CODE}` |
| **Wi-Fi/password** | `{WIFI}` | Home Wi-Fi network name (SSID) and password | `Wifi: {WIFI} // Password: {WIFI}` |
| **Sitter name** | `{SITTER}` | The sitter's real name, nickname, full name, speaker name | The sitter's real name and nickname as they appear in the text |
| **Owner name** | `{OWNER}` | The customer's (owner's) real name, couple names, initials, messenger nickname | The real names and forms of address of customers and guardians |
| **Pet** | `{PET}` | The real name and nicknames of the dog or cat in care | What the pet is really called |
| **Attached media** | `[Photo]` | Messenger photo and video attachment metadata | File attachment log lines such as `<attached: ...>` |

### 2.2 Detailed rules for cleaning messenger logs and special data

1. **Fully mask postal (zip) codes and detailed addresses (`{ADDRESS}`):**
   * **Prevention rule:** A postal code after a street name (letter + digit codes, 5 or 9 digit zip codes, and so on) is replaced together with the street name as one `{ADDRESS}`; if it is left on its own, it must still be masked as `{ADDRESS}`.
   * Partial replacement bugs like `({ADDRESS} [Postal Code])` are not allowed; it must be fully replaced as `({ADDRESS})`.
2. **Systematically mask food, item, and treat amounts, compound feeding amounts, and message counts (`{AMOUNT}`):**
   * **Message/update/photo share counts:** `N-N updates`, `N photos`, `N-N updates`, and other share counts → `{AMOUNT} updates`
   * **Multipliers and multiplier prefixes:** Multipliers such as `Nx` are masked as `{AMOUNT}`, alone or combined. (For example `Nx N/N kibble` → `{AMOUNT} of kibble`, `Nx N/N teaspoon` → `{AMOUNT}`)
   * **Fractions/decimals:** Fraction and decimal measures such as `N/N`, `N.N` → `{AMOUNT}`
   * **Spoon/pump measures:** Every number combined with a unit such as `teaspoon`, `tablespoon`, `tbsp`, `tsp`, `scoop`, `pump`, `drop` (`N teaspoon`, `N pumps`, `N drops`) → `{AMOUNT}`
   * Package units: `N pack`, `Nx pack`, `N cans`, `N bottle`, `N bags`, and so on → `{AMOUNT}`
   * Single counts of treats, vegetables, and so on: `for N [item]`, `N carrots`, `N treats`, and so on → `for {AMOUNT} [item]` or `{AMOUNT}`
   * Stops on a trip or route: `N stops left`, `N stops away`, and other counts left on a route → `{AMOUNT} stops left`
   * Trip or booking counts: `these N trips`, `N bookings`, and other specific counts → `these {AMOUNT} trips`
3. **Mask breeds (`{BREED}`):**
   * Specific breed names (for example every proper breed name in the conversation) are replaced with `{BREED}`.
     * Combined forms (for example `[Breed A] and [Breed B] breed`) are masked as `{BREED} and {BREED} breed` or `{BREED}`.
4. **Mask body functions and care frequency (`{FREQUENCY}`):**
   * Meal counts: `all N meals` → `all {FREQUENCY} meals`, `N meals per day` → `meals {FREQUENCY}`, `**{FREQUENCY} + N meals per day` → `**{FREQUENCY} + {FREQUENCY}`
   * `Nx a day` / `N times a day` forms:
     * `meals Nx a day` → `meals {FREQUENCY}`
     * `walks Nx a day` → `walks {FREQUENCY}`
     * `goes out N times a day`, `walk N times a day` → `{FREQUENCY}`
   * Poop and pee frequency: `N-N pooping per day`, `Usually N-N pooping per day`, `N-N poops a day`, `pee N times a day`, and so on → `{FREQUENCY}`
   * **Ranges first:** Recognize and replace range expressions like `N-N` before single numbers.
5. **Mask stay length, experience, and activity duration (`{DURATION}`):**
   * **Walk/outing duration:** `Walks take NN to NNmin` / `Walks take NN to {TIME}` → `Walks take {DURATION}` (a range of minutes is a length of time, so it is masked as `{DURATION}`)
   * Every nights or days form, with or without a space: `Nnights`, `N nights`, `N days`, `N full days`, and so on → `{DURATION}`
   * Years or experience: `over N years` → `over {DURATION}`, `N years already` → `{DURATION} already`, `After N years` → `After {DURATION}`
6. **Mask time ranges, spoken times, and standalone or joined times (`{TIME}`):**
   * **Spoken forms and 3 to 4 digit time ranges:** Time ranges that combine an o'clock form with a number without a colon, such as `between N o'clock and NNN`, `between N o’clock and NNN`, are replaced as a whole with `between {TIME}`.
   * **Minutes written without a space:** Minute forms with a missing space, such as `in Nminute`, `in NNminute`, are all replaced with `in {TIME}`, none missed.
   * Time ranges with no am/pm: `free anytime N-N`, `between NN-N`, `between N-N`, `N - NN is better`, and so on are all replaced with `{TIME}` (or `{TIME}-{TIME}`).
   * Standalone numbers that mean a time in context: `closer to N`, `could we do N?`, `NN will do`, `at N!`, `around NN or NN`, and so on are all replaced with `{TIME}`.
   * Time of day: `Morning between {TIME}`, `Afternoon between {TIME}`, `Evening between {TIME}`
7. **Mask standalone dates joined by a conjunction or hyphen (`{DATE}`):**
   * Standalone day numbers written after an earlier date (for example `starting {DATE} or N` → `starting {DATE} or {DATE}`, `from {DATE}-N` → `from {DATE}-{DATE}`, `{DATE} to NN` → `{DATE} to {DATE}`) are all replaced with `{DATE}`.
8. **Replacement order (compound and range expressions and address combinations first):**
   * **Address + postal code first:** Group `[address context] + [postal code]` and replace it with `{ADDRESS}` first, so no postal code fragment is left behind.
   * Replace compound range expressions (`N-N pooping per day`, `free anytime N-N`, `between Nam and Nam`, `from the [Ordinal] to the [Ordinal]`, `Npm-NNNpm`) as a whole before single words.
9. **Mask every standalone ordinal date (`{DATE}`):**
   * Ordinals used alone with no month (`[Ordinal]` and so on) are replaced with `{DATE}`, 100%.
10. **Mask every door phone key and entry security item (`{CODE}`):**
    * Security data such as door phone key numbers (`Key NNNNNNNN` and so on), buzzer numbers, and key box numbers is strictly masked as `{CODE}`.
11. **Clean up repeated masks in a row:**
    * Duplicate tags that appear after replacement (for example `{DATE}, {DATE}`, `{TIME}, {TIME}`, `{AMOUNT}, {AMOUNT}`, `{ADDRESS} {ADDRESS}`) are merged into a single tag.

---

## 3. Data split and training dataset

Anonymized data is split into 3 sets by purpose:

1. **Train Set (training):**
   * Most of the data (about 80 to 85%) is used to train conversation and daily report generation.
2. **Validation Set:**
   * About 10 to 15% of the total is split off to check generation quality and overfitting.
3. **Hold-out Test Set (blind evaluation):**
   * About 50 separate conversation or daily report sets are kept aside for before/after comparisons of model changes and for blind tests.

* **JSONL format:**
  ```json
  {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "Hi {SITTER}, can you watch {PET} for {DURATION}?"}, {"role": "assistant", "content": "Hi {OWNER}, I'd love to take care of {PET}! {DURATION} works great for me."}]}
  ```

---

## 4. Third-party processing and Zero-Retention policy (full-process §9 decision)

Goldito follows these policies to protect user privacy while the service runs and during the demo.

1. **Nebius Token Factory Zero-Retention policy:**
   * When we call the Nebius AI API, the prompts we send and the outputs follow a **Zero-Retention** model: they are not stored (retained) on the model provider's servers and are not reused as extra training data.
2. **Notice of third-party sharing:**
   * The app's privacy policy (`frontend/app/privacy.tsx`) and the Settings menu clearly say that data is sent and processed to generate AI responses (Nebius Token Factory).
3. **Block sensitive data at the source (D29, D31):**
   * Prices, dates, times, entry codes, and door lock passwords are strictly controlled by backend server logic and are never put directly into LLM prompts.

---

## 5. Preventing personal data leaks in docs and Git commits (Doc Leak Prevention)

This is the standard operating procedure (SOP) that stops real data from the original files from reaching GitHub through the docs themselves, when you write guideline docs (`*.md`), plans, comments, and commit messages.

### 5.1 Never fall into the "leak while explaining" trap
* **Background:** When an agent or a person wants to explain a replacement rule clearly, they often make the mistake of quoting a real example from the original text (for example a real postal code a customer mentioned, a specific door lock key number, a real diet item, a specific shop name, a real time slot) straight into a Markdown doc.
* **Hard rule:** **Docs never contain a single character of real tokens from the original data.**

### 5.2 Required standard: abstract dummy tokens
Every Markdown doc must use only 100% processed dummy variables, following the replacement rules below:

| Real data type | Allowed in docs (format) | Not allowed in docs (real exposure) |
| :--- | :--- | :--- |
| **Postal code / address** | `[Postal Code]`, `[City]`, `{ADDRESS}` | Real Canadian or US postal codes, real street names or unit numbers |
| **Entry code / key** | `Key NNNNNNNN`, `{CODE}` | Real 4 to 8 digit key numbers from the conversation |
| **Pet breed** | `[Breed A]`, `[Breed B]`, `{BREED}` | Specific proper breed names that appear in real conversations |
| **Food / treats / vegetables** | `for N [item]`, `N [food]` | Specific proper names of treats or vegetables from real conversations |
| **Time / duration** | `between N o'clock and NNN`, `in Nminute` | Real combinations of times and o'clock numbers, specific arrival minutes |
| **Date / nights** | `{DATE} or N`, `Nnights`, `N nights` | Real numbers of booked nights, real date numbers |
| **Quantity / multiplier units** | `Nx N/N`, `N teaspoon`, `N pack` | Real measured amounts, specific pack counts |

### 5.3 Automatic check before commit (Pre-commit Verification Checklist)
Before you stage or commit a guideline or plan doc to Git, always do these 3 steps:

1. **Regex leak scan:**
   ```bash
   # Check for leftover real postal code patterns
   git diff --staged | grep -E "[A-Za-z][0-9][A-Za-z]\s*[0-9][A-Za-z][0-9]"
   # Check for real proper names and door lock keys (numbers of 4+ digits)
   git diff --staged | grep -E "Key\s*[0-9]{4,}"
   ```
2. **No matches with the original text:**
   * Check whether the words in the Markdown doc you wrote match the original messenger text file (`raw_*.txt`) for 3 or more words in a row. If they do, generalize them right away into abstract tokens (`[Item]`, `N`).
3. **Commit only after the random sample check passes:**
   * Approve the commit only after the author and the reviewer confirm, looking only at the "example" column of the doc, that there are 0 items that allow re-identification.
