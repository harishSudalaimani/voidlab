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
		networkStack, err := pulumi.NewStackReference(ctx, "network-stack", &pulumi.StackReferenceArgs{
			Name: pulumi.String(configString(cfg, "networkStack", "snharish85-gmail-com-org/voidlab-network/network")),
		})
		if err != nil {
			return fmt.Errorf("reference network stack: %w", err)
		}
		networkReady := networkStack.GetOutput(pulumi.String("networkReady")).ApplyT(func(value interface{}) (bool, error) {
			ready, ok := value.(bool)
			if !ok {
				return false, fmt.Errorf("network stack networkReady output has type %T, expected bool", value)
			}
			if !ready {
				return false, fmt.Errorf("direct Kubernetes peer networking has not been verified")
			}
			return true, nil
		}).(pulumi.BoolOutput)
		routingMode := networkReady.ApplyT(func(bool) string { return "tunnel" }).(pulumi.StringOutput)
		apiServerPort := configString(cfg, "apiServerPort", defaultAPIServerPort)
		parsedPort, err := strconv.Atoi(apiServerPort)
		if chartVersion == "" || namespace == "" || releaseName == "" || apiServerPort == "" {
			return fmt.Errorf("chartVersion, namespace, releaseName, and apiServerPort must not be empty")
		}
		if err != nil || parsedPort < 1 || parsedPort > 65535 {
			return fmt.Errorf("apiServerPort must be between 1 and 65535")
		}

		values := pulumi.Map{
			// Istio ambient chains its CNI plugin after Cilium. Keep Cilium from
			// deleting the chained config and bypass pod-namespace socket LB so
			// ambient redirection can see the original service address.
			// Roll agents when the ConfigMap changes so these settings take effect;
			// update one node at a time on this two-node cluster.
			"rollOutCiliumPods": pulumi.Bool(true),
			"updateStrategy": pulumi.Map{
				"type": pulumi.String("RollingUpdate"),
				"rollingUpdate": pulumi.Map{
					"maxUnavailable": pulumi.Int(1),
				},
			},
			"cni": pulumi.Map{
				"exclusive": pulumi.Bool(false),
			},
			"ipam": pulumi.Map{
				"mode": pulumi.String("kubernetes"),
			},
			"kubeProxyReplacement": pulumi.String("true"),
			"l2announcements": pulumi.Map{
				"enabled": pulumi.Bool(true),
			},
			"socketLB": pulumi.Map{
				"hostNamespaceOnly": pulumi.Bool(true),
			},
			"bpf": pulumi.Map{
				"masquerade": pulumi.Bool(false),
			},
			"k8sServiceHost": apiServerIP,
			"k8sServicePort": pulumi.String(apiServerPort),
			"routingMode":    routingMode,
			"tunnelProtocol": pulumi.String("vxlan"),
			"operator": pulumi.Map{
				"replicas": pulumi.Int(1),
				"nodeSelector": pulumi.Map{
					"kubernetes.io/hostname": pulumi.String("cp"),
				},
				"tolerations": systemComponentTolerations(),
			},
			"envoy": pulumi.Map{
				"enabled": pulumi.Bool(true),
			},
			"hubble": pulumi.Map{
				"enabled": pulumi.Bool(true),
				"relay": pulumi.Map{
					"enabled": pulumi.Bool(true),
					"nodeSelector": pulumi.Map{
						"kubernetes.io/hostname": pulumi.String("cp"),
					},
					"tolerations": systemComponentTolerations(),
				},
				"ui": pulumi.Map{
					"enabled": pulumi.Bool(true),
					"nodeSelector": pulumi.Map{
						"kubernetes.io/hostname": pulumi.String("cp"),
					},
					"tolerations": systemComponentTolerations(),
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

func systemComponentTolerations() pulumi.Array {
	return pulumi.Array{
		pulumi.Map{
			"key":      pulumi.String("node-role.kubernetes.io/control-plane"),
			"operator": pulumi.String("Exists"),
			"effect":   pulumi.String("NoSchedule"),
		},
		pulumi.Map{
			"key":      pulumi.String("node.kubernetes.io/not-ready"),
			"operator": pulumi.String("Exists"),
		},
	}
}

func configString(cfg *config.Config, key, fallback string) string {
	if value := cfg.Get(key); value != "" {
		return value
	}
	return fallback
}
