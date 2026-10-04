{{- define "crm.placement" }}
nodeSelector:
  platform.doxa.io/site: {{ .Values.site | quote }}
automountServiceAccountToken: false
securityContext:
  seccompProfile: {type: RuntimeDefault}
{{- end }}
{{- define "crm.security" }}
allowPrivilegeEscalation: false
capabilities: {drop: [ALL]}
runAsNonRoot: true
{{- end }}
