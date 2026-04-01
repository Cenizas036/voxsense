import torch
import torch.nn as nn
from backend.models.cnn_backbone import CNNBackbone


class AgeModel(nn.Module):
    def __init__(self):
        super(AgeModel, self).__init__()

        self.backbone = CNNBackbone()

        self.classifier = nn.Sequential(
            nn.Linear(self.backbone.flatten_size, 256),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, 3)  # 3 age groups
        )

    def forward(self, x):
        features = self.backbone(x)
        output = self.classifier(features)
        return output
