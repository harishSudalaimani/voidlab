package main

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

func main() {
	if err := pulumi.Run(func(ctx *pulumi.Context) error {
		// Initial setup only. Libvirt resources will be added after approval.
		return nil
	}); err != nil {
		panic(err)
	}
}
