export interface AssetStub {
  id: string;
  label: string;
  source: string;
}

/** Names only. Binary meshes stay out of this first commit. */
export const assetStubs: readonly AssetStub[] = [
  { id: "moss", label: "苔藓", source: "Poly Haven" },
  { id: "rock", label: "岩石", source: "Poly Haven" },
  { id: "fern", label: "蕨类", source: "Kenney / floraZia" },
  { id: "sand", label: "砂土", source: "Poly Haven" },
];
