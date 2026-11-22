package main

import (
	"fmt"

	kubernetes "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes"
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/apiextensions"
	corev1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/core/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/helm/v3"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	argocdNamespace = "argocd"
	argocdRelease   = "argocd"
	chartName       = "argo-cd"
	chartRepository = "https://argoproj.github.io/argo-helm"
	controlPlane    = "cp"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-argocd")
		chartVersion := cfg.Get("chartVersion")
		if chartVersion == "" {
			chartVersion = "10.18.2"
		}
		appVersion := cfg.Get("appVersion")
		if appVersion == "" {
			appVersion = "v3.6.2"
		}

		namespace, err := corev1.NewNamespace(ctx, "argocd-namespace", &corev1.NamespaceArgs{
			Metadata: &metav1.ObjectMetaArgs{Name: pulumi.String(argocdNamespace)},
		})
		if err != nil {
			return fmt.Errorf("create Argo CD namespace: %w", err)
		}

		argocd, err := helm.NewRelease(ctx, "argocd", &helm.ReleaseArgs{
			Name:            pulumi.String(argocdRelease),
			Chart:           pulumi.String(chartName),
			Version:         pulumi.String(chartVersion),
			RepositoryOpts:  helm.RepositoryOptsArgs{Repo: pulumi.String(chartRepository)},
			Namespace:       pulumi.String(argocdNamespace),
			CreateNamespace: pulumi.Bool(false),
			Timeout:         pulumi.Int(900),
			Values: pulumi.Map{
				"global": pulumi.Map{
					"image": pulumi.Map{"tag": pulumi.String(appVersion)},
					"nodeSelector": pulumi.Map{
						"kubernetes.io/hostname": pulumi.String(controlPlane),
					},
					"tolerations": pulumi.Array{
						pulumi.Map{
							"key":      pulumi.String("node-role.kubernetes.io/control-plane"),
							"operator": pulumi.String("Exists"),
							"effect":   pulumi.String("NoSchedule"),
						},
					},
				},
				"server": pulumi.Map{
					"service": pulumi.Map{"type": pulumi.String("ClusterIP")},
				},
			},
		}, pulumi.DependsOn([]pulumi.Resource{namespace}))
		if err != nil {
			return fmt.Errorf("install Argo CD Helm release: %w", err)
		}

		repoURL := cfg.Get("gitOpsRepoURL")
		if repoURL == "" {
			repoURL = "https://github.com/harishSudalaimani/voidlab.git"
		}
		repoRevision := cfg.Get("gitOpsRevision")
		if repoRevision == "" {
			repoRevision = "main"
		}
		gitOpsPath := cfg.Get("gitOpsApplicationsPath")
		if gitOpsPath == "" {
			gitOpsPath = "gitops"
		}

		_, err = apiextensions.NewCustomResource(ctx, "voidlab-applications", &apiextensions.CustomResourceArgs{
			ApiVersion: pulumi.String("argoproj.io/v1alpha1"),
			Kind:       pulumi.String("Application"),
			Metadata: &metav1.ObjectMetaArgs{
				Name:      pulumi.String("voidlab-applications"),
				Namespace: pulumi.String(argocdNamespace),
			},
			OtherFields: kubernetes.UntypedArgs{
				"spec": map[string]interface{}{
					"project": "default",
					"source": map[string]interface{}{
						"repoURL":        repoURL,
						"targetRevision": repoRevision,
						"path":           gitOpsPath,
						"directory": map[string]interface{}{
							"recurse": true,
							"include": "{projects/**/*.yaml,applications/**/*.yaml}",
						},
					},
					"destination": map[string]interface{}{
						"server":    "https://kubernetes.default.svc",
						"namespace": argocdNamespace,
					},
					"syncPolicy": map[string]interface{}{
						"automated": map[string]interface{}{
							"allowEmpty": true,
							"prune":      true,
							"selfHeal":   true,
						},
					},
				},
			},
		}, pulumi.DependsOn([]pulumi.Resource{argocd}))
		if err != nil {
			return fmt.Errorf("create GitOps root Application: %w", err)
		}

		ctx.Export("argocdNamespace", pulumi.String(argocdNamespace))
		ctx.Export("argocdNodeName", pulumi.String(controlPlane))
		ctx.Export("argocdAppVersion", pulumi.String(appVersion))
		ctx.Export("argocdChartVersion", pulumi.String(chartVersion))
		ctx.Export("argocdReleaseName", pulumi.String(argocdRelease))
		ctx.Export("gitOpsRootApplication", pulumi.String("voidlab-applications"))
		ctx.Export("serverService", pulumi.String(argocdNamespace+"/argocd-server"))
		ctx.Export("uiPortForward", pulumi.String("kubectl -n "+argocdNamespace+" port-forward svc/argocd-server 8080:443"))
		return nil
	})
}
