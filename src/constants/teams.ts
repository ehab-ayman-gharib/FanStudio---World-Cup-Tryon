export interface TeamTheme {
  colors: string[];
  group: string;
}

export interface Team {
  id: string;
  name: string;
  filename: string;
  theme: TeamTheme;
}

export const TEAMS: Team[] = [
  { id: "algeria", name: "Algeria", filename: "Algeria.jpg", theme: { colors: ["#006233", "#FFFFFF", "#D21034"], group: "Group J" } },
  { id: "argentina", name: "Argentina", filename: "Argentina.jpg", theme: { colors: ["#74ACDF", "#FFFFFF", "#1E3A8A"], group: "Group J" } },
  { id: "australia", name: "Australia", filename: "australia.jpg", theme: { colors: ["#00008B", "#FFCD00", "#008751"], group: "Group D" } },
  { id: "austria", name: "Austria", filename: "Austria.jpg", theme: { colors: ["#ED2939", "#FFFFFF", "#000000"], group: "Group J" } },
  { id: "belgium", name: "Belgium", filename: "Belgium.jpg", theme: { colors: ["#E30613", "#000000", "#FFD300"], group: "Group G" } },
  { id: "bosnia", name: "Bosnia", filename: "bosnia.jpg", theme: { colors: ["#002F6C", "#FFCD00", "#FFFFFF"], group: "Group B" } },
  { id: "brazil", name: "Brazil", filename: "brazil.jpg", theme: { colors: ["#FFDF00", "#009B3A", "#002776"], group: "Group C" } },
  { id: "canada", name: "Canada", filename: "canada.jpg", theme: { colors: ["#FF0000", "#FFFFFF", "#D80000"], group: "Group B" } },
  { id: "cape-verde", name: "Cape Verde", filename: "cape-verde.jpg", theme: { colors: ["#002A8F", "#FFFFFF", "#D21034"], group: "Group H" } },
  { id: "colombia", name: "Colombia", filename: "colombia.jpg", theme: { colors: ["#FCD116", "#003893", "#CE1126"], group: "Group K" } },
  { id: "congo", name: "Congo", filename: "congo.jpg", theme: { colors: ["#009543", "#FBDE4A", "#DC241F"], group: "Group K" } },
  { id: "croatia", name: "Croatia", filename: "Croatia.jpg", theme: { colors: ["#FF0000", "#FFFFFF", "#171796"], group: "Group L" } },
  { id: "curacao", name: "Curacao", filename: "curacao.jpg", theme: { colors: ["#002B7F", "#F9E814", "#FFFFFF"], group: "Group E" } },
  { id: "czech", name: "Czech Republic", filename: "czech.jpg", theme: { colors: ["#11457E", "#FFFFFF", "#D7141A"], group: "Group A" } },
  { id: "ecuador", name: "Ecuador", filename: "Ecuador.jpg", theme: { colors: ["#FFDD00", "#032D8A", "#D11718"], group: "Group E" } },
  { id: "egypt", name: "Egypt", filename: "egypt.jpg", theme: { colors: ["#CE1126", "#FFFFFF", "#000000"], group: "Group G" } },
  { id: "england", name: "England", filename: "England.jpg", theme: { colors: ["#FFFFFF", "#CF142B", "#0B162A"], group: "Group L" } },
  { id: "france", name: "France", filename: "france.jpg", theme: { colors: ["#002395", "#FFFFFF", "#ED2939"], group: "Group I" } },
  { id: "germany", name: "Germany", filename: "germany.jpg", theme: { colors: ["#000000", "#DD0000", "#FFCC00"], group: "Group E" } },
  { id: "ghana", name: "Ghana", filename: "ghana.jpg", theme: { colors: ["#EF3340", "#FFD100", "#009739"], group: "Group L" } },
  { id: "haiti", name: "Haiti", filename: "haiti.jpg", theme: { colors: ["#00209F", "#D21034", "#FFFFFF"], group: "Group C" } },
  { id: "iran", name: "Iran", filename: "iran.jpg", theme: { colors: ["#239B56", "#FFFFFF", "#DAF7A6"], group: "Group G" } },
  { id: "iraq", name: "Iraq", filename: "iraq.jpg", theme: { colors: ["#007A3E", "#FFFFFF", "#CE1126"], group: "Group I" } },
  { id: "japan", name: "Japan", filename: "japan.jpg", theme: { colors: ["#0005A0", "#FFFFFF", "#BC002D"], group: "Group F" } },
  { id: "jordan", name: "Jordan", filename: "jordan.jpg", theme: { colors: ["#1A1A1A", "#FFFFFF", "#CE1126"], group: "Group J" } },
  { id: "korea", name: "Korea", filename: "korea.jpg", theme: { colors: ["#CD2E3A", "#0047A0", "#FFFFFF"], group: "Group A" } },
  { id: "mexico", name: "Mexico", filename: "mexico.jpg", theme: { colors: ["#006847", "#FFFFFF", "#CE1126"], group: "Group A" } },
  { id: "morocco", name: "Morocco", filename: "morocco.jpg", theme: { colors: ["#C1272D", "#006233", "#111111"], group: "Group C" } },
  { id: "netherlands", name: "Netherlands", filename: "netherlands.jpg", theme: { colors: ["#21468B", "#FFFFFF", "#AE1C28"], group: "Group F" } },
  { id: "new-zealand", name: "New Zealand", filename: "new-zealand.jpg", theme: { colors: ["#000000", "#FFFFFF", "#122F6E"], group: "Group G" } },
  { id: "norway", name: "Norway", filename: "norway.jpg", theme: { colors: ["#EF2B2D", "#FFFFFF", "#002868"], group: "Group I" } },
  { id: "panama", name: "Panama", filename: "Panama.jpg", theme: { colors: ["#DA121A", "#072357", "#FFFFFF"], group: "Group L" } },
  { id: "paraguay", name: "Paraguay", filename: "paraguay.jpg", theme: { colors: ["#0038A8", "#FFFFFF", "#D52B1E"], group: "Group D" } },
  { id: "cote-d-ivoire", name: "Côte d'Ivoire", filename: "cote-d-ivoire.jpg", theme: { colors: ["#FF8200", "#FFFFFF", "#009E60"], group: "Group E" } },
  { id: "portugal", name: "Portugal", filename: "portugal.jpg", theme: { colors: ["#046A38", "#DA291C", "#FFCD00"], group: "Group K" } },
  { id: "saudi-arabia", name: "Saudi Arabia", filename: "saudi-arabia.jpg", theme: { colors: ["#006C35", "#FFFFFF", "#004B25"], group: "Group H" } },
  { id: "scotland", name: "Scotland", filename: "Scotland.jpg", theme: { colors: ["#0065BD", "#FFFFFF", "#004B8D"], group: "Group C" } },
  { id: "qatar", name: "Qatar", filename: "qatar.jpg", theme: { colors: ["#8A1538", "#FFFFFF"], group: "Group B" } },
  { id: "south-africa", name: "South Africa", filename: "South-Africa.jpg", theme: { colors: ["#007A4D", "#FFFFFF", "#DE3831"], group: "Group A" } },
  { id: "spain", name: "Spain", filename: "spain.jpg", theme: { colors: ["#C60B1E", "#FFC72C", "#8B0000"], group: "Group H" } },
  { id: "sweden", name: "Sweden", filename: "sweden.jpg", theme: { colors: ["#006AA7", "#FECC00", "#004B87"], group: "Group F" } },
  { id: "switzerland", name: "Switzerland", filename: "switzerland.jpg", theme: { colors: ["#D52B1E", "#FFFFFF", "#B31D14"], group: "Group B" } },
  { id: "tunisia", name: "Tunisia", filename: "tunisia.jpg", theme: { colors: ["#E70013", "#FFFFFF", "#C20010"], group: "Group F" } },
  { id: "turkey", name: "Turkey", filename: "Turkey.jpg", theme: { colors: ["#E30A17", "#FFFFFF", "#C10813"], group: "Group D" } },
  { id: "usa", name: "USA", filename: "usa.jpg", theme: { colors: ["#0A3161", "#FFFFFF", "#B22234"], group: "Group D" } },
  { id: "uruguay", name: "Uruguay", filename: "Uruguay.jpg", theme: { colors: ["#0081C9", "#FFFFFF", "#FCD116"], group: "Group H" } },
  { id: "senegal", name: "Senegal", filename: "senegal.jpg", theme: { colors: ["#00853F", "#FDEF42", "#E31B23"], group: "Group I" } },
  { id: "uzbekistan", name: "Uzbekistan", filename: "uzbekistan.jpg", theme: { colors: ["#0099B5", "#FFFFFF", "#1EB53A"], group: "Group K" } }
];
