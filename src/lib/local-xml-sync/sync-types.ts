export type TargetCompany = {
  id: string;
  cnpj: string;
};

export type OneDriveItemEntry = {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: {
    childCount?: number;
  };
  file?: {
    mimeType?: string;
  };
};

export type OneDriveChildrenResponse = {
  value?: OneDriveItemEntry[];
  '@odata.nextLink'?: string;
};
