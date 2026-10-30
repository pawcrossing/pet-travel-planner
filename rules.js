/*
 * UK (Great Britain) -> EU pet travel date rules.
 * Source: gov.uk, checked 2026-10-30.
 *   - https://www.gov.uk/taking-your-pet-abroad
 *   - https://www.gov.uk/taking-your-pet-abroad/getting-an-animal-health-certificate
 *   - https://www.gov.uk/taking-your-pet-abroad/tapeworm-treatment-for-dogs
 *   - https://www.gov.uk/bring-pet-to-great-britain/tapeworm-treatment-dogs
 *   - https://www.gov.uk/government/news/new-eu-rules-for-pet-travel-for-gb-residents
 * Not veterinary advice. Works in the browser (window.PetTravelRules) and in Node (require).
 */
(function (root) {
  const RULES_CHECKED = '2026-10-30';
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;

  // Countries where a dog needs tapeworm treatment on entry, and from which no treatment is needed to return to GB.
  const TAPEWORM_COUNTRIES = ['IE', 'FI', 'MT', 'NO'];

  const DESTINATIONS = [
    ['AT', 'Austria'], ['BE', 'Belgium'], ['BG', 'Bulgaria'], ['HR', 'Croatia'], ['CY', 'Cyprus'],
    ['CZ', 'Czechia'], ['DK', 'Denmark'], ['EE', 'Estonia'], ['FI', 'Finland'], ['FR', 'France'],
    ['DE', 'Germany'], ['GR', 'Greece'], ['HU', 'Hungary'], ['IE', 'Ireland'], ['IT', 'Italy'],
    ['LV', 'Latvia'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MT', 'Malta'], ['NL', 'Netherlands'],
    ['NO', 'Norway'], ['PL', 'Poland'], ['PT', 'Portugal'], ['RO', 'Romania'], ['SK', 'Slovakia'],
    ['SI', 'Slovenia'], ['ES', 'Spain'], ['SE', 'Sweden'],
  ];

  // 'YYYY-MM-DD' -> local midnight Date
  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // 'YYYY-MM-DDTHH:MM' -> local Date
  function parseDateTime(s) {
    if (!s) return null;
    const [date, time = '12:00'] = s.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  function startOfDay(dt) {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  function addDays(dt, n) {
    const r = new Date(dt);
    r.setDate(r.getDate() + n);
    return r;
  }

  // Calendar months, clamped to month end (31 Aug + 6 months -> 28/29 Feb).
  function addMonths(dt, n) {
    const r = new Date(dt.getFullYear(), dt.getMonth() + n, 1, dt.getHours(), dt.getMinutes());
    const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(dt.getDate(), last));
    return r;
  }

  /*
   * input: {
   *   pet: 'dog' | 'cat' | 'ferret',
   *   destination: ISO code from DESTINATIONS,
   *   arriveEU: 'YYYY-MM-DDTHH:MM'   (arrival in the EU, outbound),
   *   returnGB: 'YYYY-MM-DDTHH:MM'   (arrival back in Great Britain),
   *   birthDate?, microchipDate, rabiesDate: 'YYYY-MM-DD',
   *   rabiesType: 'primary' | 'booster',   booster = no break in cover
   *   rabiesValidUntil?: 'YYYY-MM-DD',
   *   ahcDate?: 'YYYY-MM-DD'   (planned vet appointment for the certificate)
   * }
   * returns { checks: [{level: 'ok'|'warn'|'error', key, text}], dates: {...}, events: [...] }
   */
  function plan(input) {
    const checks = [];
    const events = [];
    const dates = {};
    const add = (level, key, text) => checks.push({ level, key, text });

    const arrive = parseDateTime(input.arriveEU);
    const ret = parseDateTime(input.returnGB);
    const chip = parseDate(input.microchipDate);
    const rabies = parseDate(input.rabiesDate);
    const birth = parseDate(input.birthDate);
    const rabiesUntil = parseDate(input.rabiesValidUntil);

    if (!arrive || !ret || !chip || !rabies) {
      add('error', 'missing', 'Please fill in travel dates, microchip date and rabies vaccination date.');
      return { checks, dates, events };
    }
    if (ret <= arrive) {
      add('error', 'order', 'Your return to Great Britain must be after you arrive in the EU.');
      return { checks, dates, events };
    }
    const arriveDay = startOfDay(arrive);

    // Microchip must be fitted before or on the same day as the rabies vaccination.
    if (chip > rabies) {
      add('error', 'chip', 'The microchip was fitted after the rabies vaccination. Your pet will need to be vaccinated again.');
    } else {
      add('ok', 'chip', 'Microchip fitted before or on the day of the rabies vaccination.');
    }

    // Minimum age 12 weeks at vaccination.
    if (birth) {
      const twelveWeeks = addDays(birth, 84);
      if (rabies < twelveWeeks) {
        add('error', 'age', 'Your pet was younger than 12 weeks at the rabies vaccination. It must be vaccinated again.');
      } else {
        add('ok', 'age', 'Your pet was at least 12 weeks old at the rabies vaccination.');
      }
    }

    // At least 21 full days after primary vaccination. Day 1 is the day after the vaccination,
    // so travel starts on day 22. GOV.UK's example: 1 Oct + a 30-day vaccine = travel from 1 Nov.
    if (input.rabiesType === 'primary') {
      const earliest = addDays(rabies, 22);
      dates.earliestTravel = earliest;
      if (arriveDay < earliest) {
        add('error', 'wait', 'You need to wait at least 21 full days after a first rabies vaccination before travelling. Some vaccines take longer to work, so ask your vet.');
      } else {
        add('ok', 'wait', 'The minimum 21 full days after the first rabies vaccination are complete. Some vaccines take longer to work, so check with your vet.');
      }
    } else {
      add('ok', 'wait', 'Booster with no break in cover: no waiting period needed.');
    }

    // Animal health certificate: issue date = day 1, must enter the EU by day 10.
    const ahcEarliest = addDays(arriveDay, -9);
    const ahcLatest = arriveDay;
    dates.ahcEarliest = ahcEarliest;
    dates.ahcLatest = ahcLatest;
    let ahc = parseDate(input.ahcDate);
    if (ahc) {
      if (ahc < ahcEarliest || ahc > ahcLatest) {
        add('error', 'ahc', 'Your certificate appointment is outside the 10-day window before you arrive in the EU.');
      } else {
        add('ok', 'ahc', 'Your certificate appointment is inside the 10-day window.');
      }
    }
    // Certificate is valid for 6 months for onward travel and re-entry to GB.
    const basis = ahc && ahc >= ahcEarliest && ahc <= ahcLatest ? ahc : ahcEarliest;
    const returnBy = addMonths(basis, 6);
    dates.returnBy = returnBy;
    dates.returnByBasis = ahc ? 'appointment' : 'earliest';
    if (startOfDay(ret) > returnBy) {
      add('error', 'sixmonths', 'Your return is more than 6 months after the certificate is issued. It will not be valid for re-entry.');
    }
    events.push({ date: ahcEarliest, allDay: true, title: 'Earliest day to get the animal health certificate' });
    events.push({ date: ahcLatest, allDay: true, title: 'Last day to get the animal health certificate' });

    // Rabies vaccination expiring during the trip invalidates the certificate.
    if (rabiesUntil) {
      if (rabiesUntil < startOfDay(ret)) {
        add('error', 'expiry', 'The rabies vaccination expires before you return. The certificate cannot be used for onward travel or re-entry.');
      } else {
        add('ok', 'expiry', 'The rabies vaccination stays valid for the whole trip.');
      }
    } else {
      add('warn', 'expiry', 'Add the rabies "valid until" date to check it does not expire during the trip.');
    }

    // Tapeworm treatment (dogs only), 24 to 120 hours before arrival.
    const tapewormCountry = TAPEWORM_COUNTRIES.includes(input.destination);
    if (input.pet === 'dog') {
      if (tapewormCountry) {
        const from = new Date(arrive - 120 * HOUR);
        const to = new Date(arrive - 24 * HOUR);
        dates.tapewormOut = { from, to };
        add('warn', 'tapewormOut', 'A vet must give a tapeworm treatment before you arrive and record it on the certificate.');
        events.push({ date: from, title: 'Tapeworm treatment window opens (outbound)' });
        events.push({ date: to, title: 'Tapeworm treatment window closes (outbound)' });
      } else {
        // Return trip treatment
        const from = new Date(ret - 120 * HOUR);
        const to = new Date(ret - 24 * HOUR);
        dates.tapewormReturn = { from, to };
        // Short trips: one treatment in GB before leaving can cover the return.
        if (from <= arrive) {
          dates.tapewormBeforeLeaving = { from, to: new Date(Math.min(arrive, to)) };
        }
        if (ret - arrive <= 24 * HOUR) {
          add('warn', 'tapewormReturn', 'Back within 24 hours: a vet must treat your dog for tapeworm before you leave.');
        } else if (dates.tapewormBeforeLeaving) {
          add('warn', 'tapewormReturn', 'Short trip: your UK vet can give the tapeworm treatment before you leave, or a vet abroad can give it before you return.');
        } else {
          add('warn', 'tapewormReturn', 'A vet abroad must treat your dog for tapeworm before you return to Great Britain.');
        }
        events.push({ date: from, title: 'Tapeworm treatment window opens (return to GB)' });
        events.push({ date: to, title: 'Tapeworm treatment window closes (return to GB)' });
      }
      const retreat = addDays(startOfDay(ret), 28);
      dates.retreatBy = retreat;
      events.push({ date: retreat, allDay: true, title: 'Treat your dog for tapeworm again (within 28 days of return)' });
    }

    events.push({ date: arrive, title: 'Arrive in the EU' });
    events.push({ date: ret, title: 'Arrive back in Great Britain' });
    events.sort((a, b) => a.date - b.date);
    return { checks, dates, events, tapewormCountry };
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function toICS(events) {
    const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pet Travel Planner//EN'];
    events.forEach((e, i) => {
      lines.push('BEGIN:VEVENT', `UID:pettravel-${i}-${stamp(e.date)}`);
      if (e.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${stamp(e.date)}`, `DTEND;VALUE=DATE:${stamp(addDays(e.date, 1))}`);
      } else {
        const t = `${stamp(e.date)}T${pad(e.date.getHours())}${pad(e.date.getMinutes())}00`;
        lines.push(`DTSTART:${t}`, `DTEND:${t}`);
      }
      lines.push(`SUMMARY:${e.title}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  const api = { plan, toICS, addMonths, addDays, parseDate, parseDateTime, DESTINATIONS, TAPEWORM_COUNTRIES, RULES_CHECKED, DAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PetTravelRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
