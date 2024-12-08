export class RunDockerDto {
  imageName: string;
  imageId: string;
  hostPort: string;
  containerPort: string;
  imageTag: string;
  containerName: string;
  volumes: { hostPath: string; containerPath: string }[];
  envVariables: { key: string; value: string }[];
}
