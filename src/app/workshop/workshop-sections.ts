export type WorkshopRole = "normal_user" | "highest_admin";

export type WorkshopSectionId = "public" | "submit" | "personal" | "review";

export type WorkshopSection = {
  id: WorkshopSectionId;
  label: string;
};

const BASE_SECTIONS: WorkshopSection[] = [
  { id: "public", label: "公共可见区" },
  { id: "submit", label: "提交区" },
  { id: "personal", label: "个人区域" },
];

const REVIEW_SECTION: WorkshopSection = { id: "review", label: "审核区" };

export function getVisibleWorkshopSections(role: WorkshopRole | null) {
  return role === "highest_admin" ? [...BASE_SECTIONS, REVIEW_SECTION] : BASE_SECTIONS;
}

export function isWorkshopSectionId(value: string | null): value is WorkshopSectionId {
  return value === "public" || value === "submit" || value === "personal" || value === "review";
}
