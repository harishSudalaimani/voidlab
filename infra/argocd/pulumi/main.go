package main

import (
	"fmt"

	corev1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/core/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/helm/v3"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultChartVersion = "10.18.0"
	defaultNamespace    = "argocd"
	defaultNodeName     = "worker-1"
	chartRepository     = "https://argoproj.github.io/argo-helm"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-argocd")
		chartVersion := configString(cfg, "chartVersion", defaultChartVersion)
		namespaceName := configString(cfg, "namespace", defaultNamespace)
		nodeName := configString(cfg, "nodeName", defaultNodeName)
		if chartVersion == "" || namespaceName == "" || nodeName == "" {
			return fmt.Errorf("chartVersion, namespace, and nodeName must not be empty")
		}

		argocdNamespace, err := corev1.NewNamespace(ctx, "argocd-namespace", &corev1.NamespaceArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Name: pulumi.String(namespaceName),
			},
		})
		if err != nil {
			return fmt.Errorf("create Argo CD namespace: %w", err)
		}

		values := pulumi.Map{
			"global": pulumi.Map{
				"nodeSelector": pulumi.Map{
					"kubernetes.io/hostname": pulumi.String(nodeName),
				},
			},
			"server": pulumi.Map{
				"service": pulumi.Map{
					"type": pulumi.String("ClusterIP"),
				},
			},
		}

		argocd, err := helm.NewRelease(ctx, "argocd", &helm.ReleaseArgs{
			Chart:           pulumi.String("argo-cd"),
			Version:         pulumi.String(chartVersion),
			Namespace:       pulumi.String(namespaceName),
			CreateNamespace: pulumi.Bool(false),
			RepositoryOpts: helm.RepositoryOptsArgs{
				Repo: pulumi.String(chartRepository),
			},
			Values:    values,
			SkipAwait: pulumi.Bool(false),
		}, pulumi.DependsOn([]pulumi.Resource{argocdNamespace}))
		if err != nil {
			return fmt.Errorf("install Argo CD Helm release: %w", err)
		}

		ctx.Export("argocdNamespace", pulumi.String(namespaceName))
		ctx.Export("argocdReleaseName", argocd.Status.Name())
		ctx.Export("argocdChartVersion", pulumi.String(chartVersion))
		ctx.Export("scheduledNode", pulumi.String(nodeName))
		ctx.Export("serverService", pulumi.String(namespaceName+"/argocd-server"))
		ctx.Export("uiPortForward", pulumi.String("kubectl -n "+namespaceName+" port-forward svc/argocd-server 8080:443"))
		return nil
	})
}

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}
