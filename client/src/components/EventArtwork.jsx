import './EventArtwork.css'

function Illustration({ type }) {
  switch (type) {
    case 'groceries':
      return <><path d="M66 40h88l-8 84H74Z" fill="#d9965d"/><path d="M82 43c0-23 14-34 28-34s28 11 28 34" fill="none" stroke="#875238" strokeWidth="8" strokeLinecap="round"/><path d="M85 71c-4-20 11-31 26-25-1 19-10 27-26 25Z" fill="#70a66a"/><circle cx="127" cy="67" r="18" fill="#ed7060"/><path d="M127 50c2-8 8-10 12-10" fill="none" stroke="#44815e" strokeWidth="5" strokeLinecap="round"/><path d="M93 105h36" stroke="#f6d2a6" strokeWidth="5" strokeLinecap="round"/></>
    case 'coffee':
      return <><path d="M62 53h88l-7 63a20 20 0 0 1-20 18H89a20 20 0 0 1-20-18Z" fill="#fff3df"/><path d="M149 68h13a16 16 0 0 1 0 32h-16" fill="none" stroke="#fff3df" strokeWidth="10"/><path d="M75 75h64" stroke="#b96d55" strokeWidth="7" strokeLinecap="round"/><path d="M89 37c-9-11 9-13 1-25m27 25c-9-11 9-13 1-25" fill="none" stroke="#fff3df" strokeWidth="5" strokeLinecap="round"/></>
    case 'food':
      return <><circle cx="110" cy="86" r="54" fill="#fff8ea"/><circle cx="110" cy="86" r="39" fill="#f5d6ab"/><path d="M88 78c14-19 32-18 47 3M90 100c13 9 31 9 43-3" fill="none" stroke="#e6775b" strokeWidth="7" strokeLinecap="round"/><path d="M47 37v39m-11-39v22c0 11 22 11 22 0V37m-11 39v55m131-94c-16 13-18 31-15 50h15v44" fill="none" stroke="#fff8ea" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></>
    case 'study':
      return <><path d="M110 46C91 34 69 34 46 41v79c24-6 45-5 64 7 19-12 40-13 64-7V41c-23-7-45-7-64 5Z" fill="#fff5dc"/><path d="M110 46v81M59 60c16-3 27-2 39 4m-39 16c16-3 27-2 39 4m24-20c12-6 25-7 39-4m-39 24c12-6 25-7 39-4" fill="none" stroke="#8d80ae" strokeWidth="5" strokeLinecap="round"/><path d="M88 33h44" stroke="#eebd65" strokeWidth="8" strokeLinecap="round"/></>
    case 'fitness':
      return <><path d="M46 85h128" stroke="#fff0df" strokeWidth="12" strokeLinecap="round"/><rect x="54" y="61" width="20" height="48" rx="5" fill="#fff0df"/><rect x="78" y="70" width="14" height="30" rx="4" fill="#ffd392"/><rect x="128" y="70" width="14" height="30" rx="4" fill="#ffd392"/><rect x="146" y="61" width="20" height="48" rx="5" fill="#fff0df"/><path d="M80 47c12-12 48-12 60 0" fill="none" stroke="#ffd392" strokeWidth="5" strokeLinecap="round"/></>
    case 'health':
      return <><rect x="62" y="37" width="96" height="96" rx="20" fill="#fff5ea"/><path d="M99 53h22v25h25v22h-25v25H99v-25H74V78h25Z" fill="#e77478"/><path d="M82 41v-8h56v8" fill="none" stroke="#f5c7a9" strokeWidth="7" strokeLinecap="round"/></>
    case 'nature':
      return <><circle cx="158" cy="35" r="18" fill="#ffdfa2"/><path d="M109 71v64" stroke="#8e694f" strokeWidth="12" strokeLinecap="round"/><path d="M68 92c-16-8-12-30 4-33 0-18 19-29 34-19 18-14 39-2 41 16 23-1 29 29 12 39-21 13-70 12-91-3Z" fill="#77a986"/><path d="M44 135c36-19 94-16 132 0" fill="none" stroke="#dfca9d" strokeWidth="8" strokeLinecap="round"/></>
    case 'shopping':
      return <><path d="M62 50h96l-8 83H70Z" fill="#fff2da"/><path d="M83 57V42a27 27 0 0 1 54 0v15" fill="none" stroke="#d78c82" strokeWidth="8" strokeLinecap="round"/><path d="m110 77 6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z" fill="#e6b662"/></>
    case 'home':
      return <><path d="m48 77 62-51 62 51v55H48Z" fill="#fff0d9"/><path d="m43 79 67-55 67 55" fill="none" stroke="#ba7c6c" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/><rect x="97" y="88" width="27" height="44" rx="4" fill="#ba7c6c"/><rect x="61" y="86" width="22" height="22" rx="4" fill="#a5c9c8"/><rect x="138" y="86" width="22" height="22" rx="4" fill="#a5c9c8"/></>
    case 'work':
      return <><rect x="52" y="53" width="116" height="77" rx="12" fill="#fff1dd"/><path d="M89 53V40a11 11 0 0 1 11-11h20a11 11 0 0 1 11 11v13" fill="none" stroke="#fff1dd" strokeWidth="8"/><path d="M52 83c26 17 90 17 116 0" fill="none" stroke="#c88f74" strokeWidth="7"/><rect x="102" y="83" width="16" height="17" rx="4" fill="#d8b270"/></>
    case 'travel':
      return <><rect x="61" y="30" width="98" height="89" rx="21" fill="#fff2df"/><rect x="76" y="45" width="68" height="33" rx="7" fill="#a7ccd0"/><circle cx="83" cy="97" r="7" fill="#b47b78"/><circle cx="137" cy="97" r="7" fill="#b47b78"/><path d="m77 122-12 18m78-18 12 18" stroke="#fff2df" strokeWidth="7" strokeLinecap="round"/></>
    default:
      return <><path d="M110 23c-30 0-51 21-51 50 0 35 51 71 51 71s51-36 51-71c0-29-21-50-51-50Z" fill="#fff1df"/><circle cx="110" cy="73" r="20" fill="#a8c1bb"/><path d="M84 121c17 10 35 10 52 0" fill="none" stroke="#d5a48c" strokeWidth="5" strokeLinecap="round"/></>
  }
}

export default function EventArtwork({ type = 'place' }) {
  return (
    <svg className="event-artwork" data-type={type} viewBox="0 0 220 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="220" height="150" fill="var(--art-background)" />
      <circle cx="36" cy="23" r="42" fill="var(--art-accent)" opacity=".38" />
      <circle cx="201" cy="132" r="54" fill="var(--art-accent)" opacity=".25" />
      <ellipse cx="110" cy="139" rx="78" ry="8" fill="var(--art-shadow)" opacity=".25" />
      <Illustration type={type} />
    </svg>
  )
}
