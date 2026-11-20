package main

import (
	"fmt"
	"strconv"

	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/helm/v3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultChartVersion  = "1.21.0-pre.4"
	defaultNamespace     = "kube-system"
	defaultReleaseName   = "cilium"
	defaultAPIServerPort = "6443"
	chartRepository      = "https://helm.cilium.io"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "voidlab-cilium")
		chartVersion := configString(cfg, "chartVersion", defaultChartVersion)
		namespace := configString(cfg, "namespace", defaultNamespace)
		releaseName := configString(cfg, "releaseName", defaultReleaseName)
		// Kubernetes exports this address, so Cilium does not keep a second copy in config.
		kubernetesStack, err := pulumi.NewStackReference(ctx, "kubernetes-stack", &pulumi.StackReferenceArgs{
			Name: pulumi.String(configString(cfg, "kubernetesStack", "snharish85-gmail-com-org/voidlab-kubernetes/k8")),
		})
		if err != nil {
			return fmt.Errorf("reference Kubernetes stack: %w", err)
		}
		apiServerIP := kubernetesStack.GetStringOutput(pulumi.String("controlPlaneIP"))
		apiServerPort := configString(cfg, "apiServerPort", defaultAPIServerPort)
		parsedPort, err := strconv.Atoi(apiServerPort)
		if chartVersion == "" || namespace == "" || releaseName == "" || apiServerPort == "" {
			return fmt.Errorf("chartVersion, namespace, releaseName, and apiServerPort must not be empty")
		}
		if err != nil || parsedPort < 1 || parsedPort > 65535 {
			return fmt.Errorf("apiServerPort must be between 1 and 65535")
		}

		values := pulumi.Map{
			"ipam": pulumi.Map{
				"mode": pulumi.String("kubernetes"),
			},
			"kubeProxyReplacement": pulumi.String("true"),
			"k8sServiceHost":       apiServerIP,
			"k8sServicePort":       pulumi.String(apiServerPort),
			"routingMode":          pulumi.String("tunnel"),
			"tunnelProtocol":       pulumi.String("vxlan"),
			"operator": pulumi.Map{
				"replicas": pulumi.Int(1),
			},
			"envoy": pulumi.Map{
				"enabled": pulumi.Bool(true),
			},
			"hubble": pulumi.Map{
				"enabled": pulumi.Bool(true),
				"relay": pulumi.Map{
					"enabled": pulumi.Bool(true),
				},
				"ui": pulumi.Map{
					"enabled": pulumi.Bool(true),
				},
			},
			"clustermesh": pulumi.Map{
				"useAPIServer": pulumi.Bool(false),
			},
		}

		cilium, err := helm.NewRelease(ctx, "cilium", &helm.ReleaseArgs{
			Name:      pulumi.String(releaseName),
			Chart:     pulumi.String("cilium"),
			Version:   pulumi.String(chartVersion),
			Namespace: pulumi.String(namespace),
			RepositoryOpts: &helm.RepositoryOptsArgs{
				Repo: pulumi.String(chartRepository),
			},
			CreateNamespace: pulumi.Bool(false),
			Values:          values,
			SkipAwait:       pulumi.Bool(false),
			Timeout:         pulumi.Int(900),
		})
		if err != nil {
			return fmt.Errorf("register Cilium Helm release: %w", err)
		}

		ctx.Export("releaseName", cilium.Name)
		ctx.Export("namespace", pulumi.String(namespace))
		ctx.Export("chartVersion", pulumi.String(chartVersion))
		ctx.Export("hubbleRelayEnabled", pulumi.Bool(true))
		ctx.Export("statusCommand", pulumi.String("cilium status --wait"))
		return nil
	})
}

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}
